import { Injectable, Optional } from '@nestjs/common';
import type { MusicSettings } from '@mytube/shared';
import { z } from 'zod';
import { AppConfig } from '../config/app-config.js';
import { RateLimiter, fetchJson, sameName, yearOf } from './lookup-support.js';
import {
  type LookupContext,
  type MetadataProvider,
  type ProviderResult,
  type TrackLookup,
  searchTitles,
} from './provider.js';

/*
 * Discogs (https://www.discogs.com/developers): a release search by artist and track title,
 * then the chosen release's tracklist for the track's position. Authenticated with the user's
 * personal access token in the `Authorization` header (never in the URL, never logged); their
 * limit for authenticated requests is 60 per minute, so one per second.
 */

export const DISCOGS_API = 'https://api.discogs.com';
/** 60 authenticated requests per minute. */
export const DISCOGS_INTERVAL_MS = 1000;
export const DISCOGS_TIMEOUT_MS = 10_000;

export const DiscogsSearch = z
  .object({
    results: z.array(
      z
        .object({
          id: z.number().int(),
          title: z.string(),
          year: z.string().nullish(),
          format: z.array(z.string()).nullish(),
        })
        .loose(),
    ),
  })
  .loose();
type SearchResult = z.infer<typeof DiscogsSearch>['results'][number];

export const DiscogsRelease = z
  .object({
    id: z.number().int(),
    title: z.string(),
    year: z.number().int().nullish(),
    released: z.string().nullish(),
    artists: z.array(z.object({ name: z.string(), join: z.string().nullish() }).loose()).nullish(),
    tracklist: z
      .array(
        z
          .object({
            position: z.string().nullish(),
            type_: z.string().nullish(),
            title: z.string(),
          })
          .loose(),
      )
      .nullish(),
  })
  .loose();
type DiscogsRelease = z.infer<typeof DiscogsRelease>;

/** The release search URL: artist and track title, ten releases. */
export function discogsSearchUrl(artist: string, title: string): string {
  const params = new URLSearchParams({ type: 'release', artist, track: title, per_page: '10' });
  return `${DISCOGS_API}/database/search?${params.toString()}`;
}

export function discogsReleaseUrl(id: number): string {
  return `${DISCOGS_API}/releases/${id}`;
}

/** Discogs marks namesakes `Name (2)` and variations `Name*`; neither is part of the name. */
export function discogsName(name: string): string {
  return name
    .replace(/\s*\(\d+\)$/, '')
    .replace(/\*$/, '')
    .trim();
}

/** `Hiatus Kaiyote - Mood Valiant` → artist and title (the first ` - ` splits them). */
function splitResultTitle(title: string): { artist: string; album: string } | null {
  const at = title.indexOf(' - ');
  if (at === -1) return null;
  return { artist: discogsName(title.slice(0, at)), album: title.slice(at + 3).trim() };
}

/** The artists of a Discogs credit: `MDK & t+pazolite` → both; a plain credit is itself. */
function creditNames(credit: string | undefined): string[] {
  if (!credit) return [];
  const names = credit
    .split(/\s+(?:&|x|×|and|feat\.?|ft\.?|featuring|vs\.?)\s+|\s*,\s*/i)
    .map((name) => discogsName(name));
  return [credit, ...names];
}

/** Digital and CD releases number tracks plainly; vinyl and tape use sides (`A1`). */
function formatRank(result: SearchResult): number {
  const formats = result.format ?? [];
  if (formats.includes('File') || formats.includes('CD')) return 0;
  return 1;
}

/**
 * The release to read from a search (pure): results by our artist, with our album's title when
 * yt-dlp knows the album (confidence 0.9), else the first one, digital and CD first
 * (confidence 0.8). Null when nothing fits.
 */
export function pickDiscogsResult(
  search: z.infer<typeof DiscogsSearch>,
  track: TrackLookup,
): { result: SearchResult; confidence: number } | null {
  const { artist, album } = track.tags;
  if (!artist) return null;
  // A collaboration credit (`MDK & t+pazolite`) counts when it names our artist.
  const byArtist = search.results.filter((result) =>
    creditNames(splitResultTitle(result.title)?.artist).some((name) => sameName(name, artist)),
  );
  const candidates = album
    ? byArtist.filter((result) => sameName(splitResultTitle(result.title)?.album, album))
    : byArtist;
  // Stable: keeps Discogs' relevance order within a format rank.
  const result = candidates.toSorted((a, b) => formatRank(a) - formatRank(b))[0];
  if (!result) return null;
  return { result, confidence: album ? 0.9 : 0.8 };
}

/**
 * The track in a release's tracklist (pure): its title matched, headings and index tracks
 * skipped. Positions `3` are track 3, `2-5` (or `2.5`) disc 2 track 5; side positions (`A1`,
 * `B2`) count the tracks in order and leave the disc empty.
 */
export function findDiscogsTrack(
  release: DiscogsRelease,
  title: string,
): { trackNumber: number; discNumber: number | null } | null {
  // `type_` is Discogs' field name.
  // oxlint-disable-next-line eslint/no-underscore-dangle
  const tracks = (release.tracklist ?? []).filter((entry) => (entry.type_ ?? 'track') === 'track');
  const index = tracks.findIndex((entry) => sameName(entry.title, title));
  if (index === -1) return null;
  const position = tracks[index]!.position?.trim() ?? '';
  const discTrack = /^(\d+)[-.](\d+)$/.exec(position);
  if (discTrack) return { discNumber: Number(discTrack[1]), trackNumber: Number(discTrack[2]) };
  if (/^\d+$/.test(position)) return { discNumber: 1, trackNumber: Number(position) };
  return { discNumber: null, trackNumber: index + 1 };
}

function releaseArtist(release: DiscogsRelease): string | null {
  const artists = release.artists ?? [];
  if (artists.length === 0) return null;
  return artists
    .map((artist, i) => {
      const join = i < artists.length - 1 ? (artist.join?.trim() ?? '') : '';
      return `${discogsName(artist.name)}${join === ',' ? ', ' : join ? ` ${join} ` : ''}`;
    })
    .join('')
    .trim();
}

/**
 * The Discogs provider: off by default and skipped without a token. Two requests per lookup
 * (search, release), one per second.
 */
@Injectable()
export class DiscogsProvider implements MetadataProvider {
  readonly name = 'discogs';
  readonly label = 'Discogs';
  private readonly limiter: RateLimiter;
  /** Per request; tests shorten it. */
  timeoutMs = DISCOGS_TIMEOUT_MS;

  constructor(
    private readonly config: AppConfig,
    @Optional() limiter?: RateLimiter,
  ) {
    this.limiter = limiter ?? new RateLimiter(DISCOGS_INTERVAL_MS);
  }

  enabled(settings: MusicSettings): boolean {
    const { discogs } = settings.metadataProviders;
    return discogs.enabled && discogs.token !== null;
  }

  async lookup(track: TrackLookup, context: LookupContext): Promise<ProviderResult> {
    const token = context.settings.metadataProviders.discogs.token;
    const { artist } = track.tags;
    if (!token || !artist) return { match: null, tried: [] };
    const get = async (url: string) => {
      await this.limiter.wait(context.signal);
      return fetchJson(url, {
        service: this.label,
        headers: {
          'User-Agent': `MyTube/${this.config.version} +https://github.com/ChappIO/my-tube`,
          Accept: 'application/vnd.discogs.v2.discogs+json',
          Authorization: `Discogs token=${token}`,
        },
        timeoutMs: this.timeoutMs,
        signal: context.signal,
      });
    };

    return searchTitles(track, async (title) => {
      const search = DiscogsSearch.safeParse(await get(discogsSearchUrl(artist, title)));
      if (!search.success) throw new Error(`${this.label} answered an unexpected document`);
      const picked = pickDiscogsResult(search.data, track);
      if (!picked) return null;
      const release = DiscogsRelease.safeParse(await get(discogsReleaseUrl(picked.result.id)));
      if (!release.success) throw new Error(`${this.label} answered an unexpected document`);
      const position = findDiscogsTrack(release.data, title);
      if (!position) {
        return {
          tags: {},
          confidence: 0,
          summary: `release ${release.data.id} has no track named ${JSON.stringify(title)}`,
        };
      }
      return {
        tags: {
          album: release.data.title,
          albumArtist: releaseArtist(release.data),
          trackNumber: position.trackNumber,
          discNumber: position.discNumber,
          year:
            yearOf(release.data.year) ??
            yearOf(release.data.released) ??
            yearOf(picked.result.year),
        },
        confidence: picked.confidence,
        summary: `release ${release.data.id}`,
      };
    });
  }
}
