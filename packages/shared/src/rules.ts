import { z } from 'zod';
import {
  Matcher,
  PLAYLIST_ONLY_LEAVES,
  and,
  describeMatcher,
  matcherLeaves,
  not,
  type Matcher as MatcherValue,
} from './matchers.js';

/*
 * Sources, their rules and their options.
 *
 * A source is a channel, artist or playlist the user added to one library. Its rules are one
 * matcher tree (`matchers.ts`, stored in `sources.matcher`) that decides what is downloaded
 * and what stays. Settings that are not predicates are plain options (`sources.options`).
 *
 * New sources start from the library's default tree in Settings → Video / Music
 * (`video.defaultRules`, `music.defaultRules`).
 */

/** The two libraries. Every source and every downloaded item belongs to exactly one. */
export const Library = z.enum(['video', 'music']);
export type Library = z.infer<typeof Library>;

/** What a source points at on YouTube. `artist` is a YouTube Music artist. */
export const SourceKind = z.enum(['channel', 'artist', 'playlist']);
export type SourceKind = z.infer<typeof SourceKind>;

/** Per-source options that are not predicates. Unknown fields are stripped. */
export const SourceOptions = z.object({
  /** Music: embed cover art and tags ("from YouTube Music"). Ignored for video. */
  embedCoverArt: z.boolean().default(true),
  /** Playlists only: number files in playlist order instead of by upload date. */
  syncOrder: z.boolean().default(false),
});
export type SourceOptions = z.infer<typeof SourceOptions>;

export const DEFAULT_SOURCE_OPTIONS: SourceOptions = SourceOptions.parse({});

/** Option chips after the rule chips: `sync order` (playlists), `cover art` (music). */
export function describeOptions(options: SourceOptions, library: Library): string[] {
  const chips: string[] = [];
  if (options.syncOrder) chips.push('sync order');
  if (library === 'music' && options.embedCoverArt) chips.push('cover art');
  return chips;
}

/** Every chip of a source: its rules, then its options. */
export function describeSource(source: {
  library: Library;
  matcher: MatcherValue;
  options: SourceOptions;
}): string[] {
  return [...describeMatcher(source.matcher), ...describeOptions(source.options, source.library)];
}

export interface SourceIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Combinations of library, kind, rules and options that are not allowed: an `artist` outside
 * the Music library, the playlist-only conditions (`channel_is`, `in_playlist_position_under`)
 * and `syncOrder` on anything but a playlist. Empty when the combination is valid.
 */
export function sourceIssues(source: {
  library: Library;
  kind: SourceKind;
  matcher?: MatcherValue;
  options?: Pick<SourceOptions, 'syncOrder'>;
}): SourceIssue[] {
  const issues: SourceIssue[] = [];
  if (source.kind === 'artist' && source.library !== 'music') {
    issues.push({ path: ['kind'], message: 'Artists belong to the Music library' });
  }
  if (source.kind !== 'playlist') {
    if (source.options?.syncOrder) {
      issues.push({
        path: ['options', 'syncOrder'],
        message: 'Sync order only applies to playlists',
      });
    }
    const leaf = source.matcher
      ? matcherLeaves(source.matcher).find((item) => PLAYLIST_ONLY_LEAVES.includes(item.type))
      : undefined;
    if (leaf) {
      issues.push({
        path: ['matcher'],
        message:
          leaf.type === 'channel_is'
            ? 'The channel condition only applies to playlists'
            : 'The playlist position condition only applies to playlists',
      });
    }
  }
  return issues;
}

/** ISO 8601 UTC timestamp as stored in the database (`2026-09-24T19:35:10.000Z`). */
const Timestamp = z.iso.datetime();

/**
 * A source as the API returns it: one `sources` row with its matcher and options parsed.
 * Rejects the combinations listed in `sourceIssues`.
 */
export const Source = z
  .object({
    id: z.number().int().positive(),
    library: Library,
    kind: SourceKind,
    /** Channel id (`UC…`), YouTube Music artist id or playlist id (`PL…`). */
    youtubeId: z.string().min(1),
    url: z.url(),
    name: z.string().min(1),
    avatarUrl: z.url().nullable(),
    /** Checked for new content on the schedule. Unsubscribing never deletes files. */
    subscribed: z.boolean(),
    /** The rules: what is downloaded and what stays. */
    matcher: Matcher,
    options: SourceOptions,
    /** Last completed check, null before the first one. */
    lastCheckedAt: Timestamp.nullable(),
    /** Cached count of known items (videos or tracks). */
    itemCount: z.number().int().nonnegative(),
    /** Cached size on disk in bytes. */
    sizeBytes: z.number().int().nonnegative(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .superRefine((source, ctx) => {
    for (const issue of sourceIssues(source)) ctx.addIssue({ code: 'custom', ...issue });
  });
export type Source = z.infer<typeof Source>;

// ---------------------------------------------------------------------------------------
// Legacy flat rules (Stage 3), kept only to convert stored rows once.
// ---------------------------------------------------------------------------------------

/** The Stage 3 video rules as stored in `sources.rules`. Missing fields take their defaults. */
export const LegacyVideoRules = z.object({
  library: z.literal('video'),
  skipShorts: z.boolean().default(true),
  keepDays: z.number().int().min(1).max(3650).nullable().default(90),
  publishedAfter: z.iso.date().nullable().default(null),
  titleFilter: z.string().trim().min(1).max(200).nullable().default(null),
  syncOrder: z.boolean().default(false),
});
/** The Stage 3 music rules. */
export const LegacyMusicRules = z.object({
  library: z.literal('music'),
  skipLiveRecordings: z.boolean().default(false),
  embedCoverArt: z.boolean().default(true),
});
export const LegacyRules = z.discriminatedUnion('library', [LegacyVideoRules, LegacyMusicRules]);
export type LegacyRules = z.input<typeof LegacyRules>;

/** "live" as a word: "Live at Wembley", "(Live)", not "Olive". The old skip-live rule. */
export const LIVE_WORD_PATTERN = '\\blive\\b';

/**
 * The matcher and options equivalent to Stage 3 flat rules. Each rule that was on becomes one
 * item of a root `and`, in this order: `skipShorts` → `not(is_short)`, `keepDays` →
 * `not(older_than_days)`, `publishedAfter` → `published_after`, `titleFilter` →
 * `title_contains`, `skipLiveRecordings` → `not(title_matches \blive\b)`. `syncOrder` and
 * `embedCoverArt` become options. Rules that were off add nothing, so all-off is `and()`
 * (match everything), which is what the old rules meant. Takes stored JSON as is and throws on
 * input that was never valid.
 */
export function convertLegacyRules(old: unknown): {
  matcher: MatcherValue;
  options: SourceOptions;
} {
  const rules = LegacyRules.parse(old);
  const items: MatcherValue[] = [];
  if (rules.library === 'video') {
    if (rules.skipShorts) items.push(not({ type: 'is_short' }));
    if (rules.keepDays !== null) items.push(not({ type: 'older_than_days', days: rules.keepDays }));
    if (rules.publishedAfter !== null) {
      items.push({ type: 'published_after', date: rules.publishedAfter });
    }
    if (rules.titleFilter !== null) items.push({ type: 'title_contains', text: rules.titleFilter });
    return {
      matcher: and(...items),
      options: { ...DEFAULT_SOURCE_OPTIONS, syncOrder: rules.syncOrder },
    };
  }
  if (rules.skipLiveRecordings) {
    items.push(not({ type: 'title_matches', pattern: LIVE_WORD_PATTERN }));
  }
  return {
    matcher: and(...items),
    options: { ...DEFAULT_SOURCE_OPTIONS, embedCoverArt: rules.embedCoverArt },
  };
}
