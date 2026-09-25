import type { MusicSettings } from '@mytube/shared';
import type { TrackTags } from './ytdlp-tags.js';

/*
 * The music metadata provider chain (architecture skill, settled decisions). yt-dlp's own tags
 * (`ytdlpTagArgs`, YouTube Music's metadata) are the baseline and always on. After a track is
 * downloaded, the enabled providers are asked in order (MusicBrainz, then Discogs); per field
 * the first confident answer wins, and the merged tags are written into the file.
 */

/** A tag field a provider can improve. */
export type TagField = keyof TrackTags;

/**
 * The fields providers enrich: what the release says. Title and artist stay yt-dlp's (the
 * library, the file name and the rules use them), so a provider only files the track.
 */
export const ENRICHED_FIELDS = [
  'album',
  'albumArtist',
  'trackNumber',
  'discNumber',
  'year',
] as const satisfies readonly TagField[];
export type EnrichedField = (typeof ENRICHED_FIELDS)[number];

/** A field value counts from this confidence up (0 to 1). */
export const CONFIDENT = 0.8;

/** What a provider looks up: the downloaded track and yt-dlp's tags for it. */
export interface TrackLookup {
  youtubeId: string;
  /** The baseline: what yt-dlp writes (title, artist, album, numbers, year). */
  tags: TrackTags;
  durationSeconds: number | null;
  /**
   * The upload's title with only its framing symbols removed (`MDK x t+pazolite - Password`),
   * when it differs from the cleaned title: the fallback search. Null for YouTube Music tracks.
   */
  uploadTitle: string | null;
  /** Artists credited next to ours in the upload title: an extra search term. */
  featuredArtists: string[];
}

/** The titles a provider searches, in order: the cleaned one, then the upload's. */
export function lookupTitles(track: TrackLookup): string[] {
  const titles = [track.tags.title, track.uploadTitle].filter(
    (title): title is string => typeof title === 'string' && title.trim() !== '',
  );
  return [...new Set(titles)];
}

/** One provider's answer and the titles it searched, in order, for the job log. */
export interface ProviderResult {
  /** The best answer, or null when nothing was found for any title. */
  match: ProviderMatch | null;
  tried: string[];
  /** Other artists the search named (MusicBrainz sends the featured artists). */
  alsoSearched?: string[];
}

export interface LookupContext {
  /** Settings → Music, read when the job runs (tokens, toggles). */
  settings: MusicSettings;
  /** The job's signal: a cancel or shutdown stops a lookup. */
  signal?: AbortSignal;
  /** The job log. Never write a token into it. */
  log: (line: string) => void;
}

/** One provider's answer. */
export interface ProviderMatch {
  /** The values it found. Fields it has nothing for are left out. */
  tags: Partial<Pick<TrackTags, EnrichedField>>;
  /** 0 to 1 for the match as a whole. */
  confidence: number;
  /** Per-field confidence where it differs from the whole. */
  fieldConfidence?: Partial<Record<EnrichedField, number>>;
  /** What matched, for the job log (ids, the release chosen, or why nothing was taken). */
  summary: string;
}

/**
 * A metadata provider. To add one: implement this, give it a rate limiter and a timeout for
 * its HTTP calls, add its settings to `MetadataProviders` in shared (off by default), provide
 * it in `MetadataModule` and put it in the chain's order there.
 */
export interface MetadataProvider {
  /** Settings key and log prefix (`musicbrainz`). */
  readonly name: string;
  /** Display name for the job log (`MusicBrainz`). */
  readonly label: string;
  /** Whether it runs for these settings (toggle on and whatever it needs, such as a token). */
  enabled(settings: MusicSettings): boolean;
  /**
   * Looks the track up, one title of `lookupTitles` after the other until one gives a confident
   * match. Rejects on network or HTTP errors, which the chain logs and skips.
   */
  lookup(track: TrackLookup, context: LookupContext): Promise<ProviderResult>;
}

/**
 * Runs `search` for each of the track's titles until one answers confidently; the result keeps
 * the first answer found (a confident one when there is one) and every title tried.
 */
export async function searchTitles(
  track: TrackLookup,
  search: (title: string) => Promise<ProviderMatch | null>,
  alsoSearched: string[] = [],
): Promise<ProviderResult> {
  const tried: string[] = [];
  let best: ProviderMatch | null = null;
  for (const title of lookupTitles(track)) {
    tried.push(title);
    const match = await search(title);
    if (match && match.confidence >= CONFIDENT) return { match, tried, alsoSearched };
    best ??= match;
  }
  return { match: best, tried, alsoSearched };
}

/**
 * The search a result came from, for the job log: `"Password" by MDK with t+pazolite (also
 * tried "MDK x t+pazolite - Password")`.
 */
export function describeSearch(track: TrackLookup, result: ProviderResult): string {
  const [first, ...rest] = result.tried;
  if (first === undefined) return 'no search (no title or artist)';
  const also = result.alsoSearched?.length ? ` with ${result.alsoSearched.join(', ')}` : '';
  const others = rest.map((title) => JSON.stringify(title)).join(', ');
  return `${JSON.stringify(first)} by ${track.tags.artist ?? '?'}${also}${
    others ? ` (also tried ${others})` : ''
  }`;
}

/** The confidence of one field of a match. */
export function fieldConfidence(match: ProviderMatch, field: EnrichedField): number {
  return match.fieldConfidence?.[field] ?? match.confidence;
}

/**
 * The chain's merge: per enriched field, the first match (in provider order) that is confident
 * about a non-empty value wins; otherwise the baseline stays. Title and artist are the
 * baseline's.
 */
export function mergeTags(baseline: TrackTags, matches: readonly ProviderMatch[]): TrackTags {
  const merged: TrackTags = { ...baseline };
  for (const field of ENRICHED_FIELDS) {
    for (const match of matches) {
      const value = match.tags[field];
      if (value === undefined || value === null || value === '') continue;
      if (fieldConfidence(match, field) < CONFIDENT) continue;
      (merged as Record<EnrichedField, string | number | null>)[field] = value;
      break;
    }
  }
  return merged;
}

/** The enriched fields whose values differ between two tag sets. */
export function changedFields(before: TrackTags, after: TrackTags): EnrichedField[] {
  return ENRICHED_FIELDS.filter((field) => before[field] !== after[field]);
}

const FIELD_LABELS: Record<EnrichedField, string> = {
  album: 'album',
  albumArtist: 'album artist',
  trackNumber: 'track',
  discNumber: 'disc',
  year: 'year',
};

/** `album "Mood Valiant", track 3, year 2021` for the job log. */
export function describeTags(
  tags: Partial<TrackTags>,
  fields: readonly EnrichedField[] = ENRICHED_FIELDS,
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const value = tags[field];
    if (value === undefined || value === null || value === '') continue;
    parts.push(
      `${FIELD_LABELS[field]} ${typeof value === 'string' ? JSON.stringify(value) : value}`,
    );
  }
  return parts.join(', ');
}
