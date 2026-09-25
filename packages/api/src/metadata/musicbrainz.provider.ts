import { Injectable, Optional } from '@nestjs/common';
import type { MusicSettings } from '@mytube/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app-config.js';
import { RateLimiter, fetchJson, sameName, yearOf } from './lookup-support.js';
import {
  type LookupContext,
  type MetadataProvider,
  type ProviderMatch,
  type ProviderResult,
  type TrackLookup,
  searchTitles,
} from './provider.js';

/*
 * MusicBrainz (https://musicbrainz.org/doc/MusicBrainz_API): a recording search by title and
 * artist, then the best release of the matching recordings. Their rules: a User-Agent naming
 * the application, its version and a contact, and at most one request per second.
 */

export const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
/** MusicBrainz asks for at most one request per second per application. */
export const MUSICBRAINZ_INTERVAL_MS = 1000;
export const MUSICBRAINZ_TIMEOUT_MS = 10_000;
/** The search's own score (0 to 100) a recording needs. */
const MIN_SCORE = 90;
/** A recording whose length differs more than this from the download is another take. */
const LENGTH_TOLERANCE_SECONDS = 10;

const ArtistCredit = z.array(
  z.object({ name: z.string(), joinphrase: z.string().optional() }).loose(),
);

const Release = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.string().nullish(),
    date: z.string().nullish(),
    'artist-credit': ArtistCredit.optional(),
    'release-group': z
      .object({
        'primary-type': z.string().nullish(),
        'secondary-types': z.array(z.string()).nullish(),
      })
      .loose()
      .optional(),
    media: z
      .array(
        z
          .object({
            position: z.number().int().nullish(),
            'track-offset': z.number().int().nullish(),
            track: z.array(z.object({ number: z.string().nullish() }).loose()).nullish(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();
type Release = z.infer<typeof Release>;

const Recording = z
  .object({
    id: z.string(),
    score: z.number(),
    title: z.string(),
    length: z.number().nullish(),
    'artist-credit': ArtistCredit.optional(),
    releases: z.array(Release).optional(),
  })
  .loose();
type Recording = z.infer<typeof Recording>;

export const RecordingSearch = z.object({ recordings: z.array(Recording) }).loose();

/** Lucene phrase with `"` and `\` escaped. */
function phrase(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * The recording search URL: title and artist as required phrases, featured artists as optional
 * ones (Lucene `+a +b c`: they raise the score of a collaboration's recording, never exclude
 * one), ten results, JSON.
 */
export function recordingSearchUrl(title: string, artist: string, featured: string[] = []): string {
  const extra = featured.map((name) => ` artist:${phrase(name)}`).join('');
  const query = `recording:${phrase(title)} AND artist:${phrase(artist)}${extra}`;
  return `${MUSICBRAINZ_API}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
}

/** Their required User-Agent: application, version and a contact URL. */
export function musicbrainzUserAgent(version: string): string {
  return `MyTube/${version} ( https://github.com/ChappIO/my-tube )`;
}

function credited(credit: z.infer<typeof ArtistCredit> | undefined): string | null {
  if (!credit || credit.length === 0) return null;
  return credit
    .map((part) => `${part.name}${part.joinphrase ?? ''}`)
    .join('')
    .trim();
}

/** The artist credit names our artist: as the whole credit or its first name. */
function creditsArtist(credit: z.infer<typeof ArtistCredit> | undefined, artist: string): boolean {
  return sameName(credited(credit), artist) || sameName(credit?.[0]?.name, artist);
}

/**
 * Release preference when the album is not known (or several releases carry its title): official
 * first, then plain albums (no compilation, live or remix types), then album over EP over
 * single, then the earliest date.
 */
function releaseRank(release: Release): (number | string)[] {
  const group = release['release-group'];
  const primary = group?.['primary-type'] ?? '';
  const typeRank = ['Album', 'EP', 'Single'].indexOf(primary);
  return [
    release.status === 'Official' ? 0 : 1,
    (group?.['secondary-types'] ?? []).length > 0 ? 1 : 0,
    typeRank === -1 ? 3 : typeRank,
    release.date || '9999',
  ];
}

function compareRanks(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/**
 * Picks the answer from a recording search (pure, so the fixtures test it):
 *
 * 1. Recordings with a search score of at least 90, the same title and artist (accents, case
 *    and punctuation aside) and, when both lengths are known, within 10 s of the download.
 * 2. Their releases. With a known album (yt-dlp's), only releases of that title count
 *    (confidence 0.95; the year is the earliest of them, the original release); if none carries
 *    it the answer is not confident, because the numbers of another release would not fit.
 *    Without an album, the best release by `releaseRank` (confidence 0.85).
 * 3. From the release: album, album artist (its credit, else the recording's), track number
 *    (the medium's track offset + 1, else its number), disc (the medium's position) and year.
 */
export function pickRecordingMatch(
  search: z.infer<typeof RecordingSearch>,
  track: TrackLookup,
  /** The title searched: the cleaned one, or the upload's as the fallback. */
  title: string | null = track.tags.title,
): ProviderMatch | null {
  const { artist, album } = track.tags;
  if (!title || !artist) return null;
  const recordings = search.recordings.filter(
    (recording) =>
      recording.score >= MIN_SCORE &&
      sameName(recording.title, title) &&
      creditsArtist(recording['artist-credit'], artist) &&
      lengthFits(recording, track.durationSeconds),
  );
  if (recordings.length === 0) return null;

  const releases = recordings.flatMap((recording) =>
    (recording.releases ?? []).map((release) => ({ recording, release })),
  );
  const byRank = (a: { release: Release }, b: { release: Release }) =>
    compareRanks(releaseRank(a.release), releaseRank(b.release));
  const recordingIds = recordings.map((recording) => recording.id).join(', ');

  let chosen: { recording: Recording; release: Release } | undefined;
  let confidence: number;
  let year: number | null;
  if (album) {
    const named = releases.filter(({ release }) => sameName(release.title, album)).toSorted(byRank);
    chosen = named[0];
    if (!chosen) {
      return {
        tags: {},
        confidence: 0,
        summary: `recording ${recordingIds}, but no release named ${JSON.stringify(album)}`,
      };
    }
    confidence = 0.95;
    const years = named
      .map(({ release }) => yearOf(release.date))
      .filter((y): y is number => y !== null);
    year = years.length > 0 ? Math.min(...years) : null;
  } else {
    chosen = releases.toSorted(byRank)[0];
    if (!chosen) {
      return { tags: {}, confidence: 0, summary: `recording ${recordingIds} is on no release` };
    }
    confidence = 0.85;
    year = yearOf(chosen.release.date);
  }

  const { release } = chosen;
  const medium = release.media?.[0];
  const offset = medium?.['track-offset'];
  const number = Number.parseInt(medium?.track?.[0]?.number ?? '', 10);
  return {
    tags: {
      album: release.title,
      // The search leaves a release's credit out when it is the recording's.
      albumArtist:
        credited(release['artist-credit']) ?? credited(chosen.recording['artist-credit']),
      trackNumber: typeof offset === 'number' ? offset + 1 : Number.isNaN(number) ? null : number,
      discNumber: medium?.position ?? null,
      year,
    },
    confidence,
    summary: `recording ${chosen.recording.id}, release ${release.id}`,
  };
}

function lengthFits(recording: Recording, seconds: number | null): boolean {
  if (seconds === null || recording.length == null) return true;
  return Math.abs(recording.length / 1000 - seconds) <= LENGTH_TOLERANCE_SECONDS;
}

/** The MusicBrainz provider: off by default, one request per lookup, one per second. */
@Injectable()
export class MusicBrainzProvider implements MetadataProvider {
  readonly name = 'musicbrainz';
  readonly label = 'MusicBrainz';
  private readonly limiter: RateLimiter;
  /** Per request; tests shorten it. */
  timeoutMs = MUSICBRAINZ_TIMEOUT_MS;

  constructor(
    private readonly config: AppConfig,
    @Optional() limiter?: RateLimiter,
  ) {
    this.limiter = limiter ?? new RateLimiter(MUSICBRAINZ_INTERVAL_MS);
  }

  enabled(settings: MusicSettings): boolean {
    return settings.metadataProviders.musicbrainz.enabled;
  }

  async lookup(track: TrackLookup, context: LookupContext): Promise<ProviderResult> {
    const { artist } = track.tags;
    if (!artist) return { match: null, tried: [] };
    return searchTitles(
      track,
      async (title) => {
        await this.limiter.wait(context.signal);
        const body = await fetchJson(recordingSearchUrl(title, artist, track.featuredArtists), {
          service: this.label,
          headers: {
            'User-Agent': musicbrainzUserAgent(this.config.version),
            Accept: 'application/json',
          },
          timeoutMs: this.timeoutMs,
          signal: context.signal,
        });
        const parsed = RecordingSearch.safeParse(body);
        if (!parsed.success) throw new Error(`${this.label} answered an unexpected document`);
        return pickRecordingMatch(parsed.data, track, title);
      },
      track.featuredArtists,
    );
  }
}
