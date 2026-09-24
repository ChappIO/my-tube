import { z } from 'zod';

/*
 * Sources and their rules.
 *
 * A source is a channel, artist or playlist the user added to one library. Each source keeps
 * its own rule set, stored as JSON in `sources.rules`. The rule set depends on the library:
 * video sources get the video rules, music sources the music rules (handoff Screen 4, "Rules").
 *
 * Rules decide what the sync accepts; they are evaluated in Stage 4 ("Rule evaluation").
 * Defaults for new video sources come from Settings → Video (`keepDays`, `skipShorts`); the
 * constants below are the handoff defaults used when no settings apply.
 */

/** The two libraries. Every source and every downloaded item belongs to exactly one. */
export const Library = z.enum(['video', 'music']);
export type Library = z.infer<typeof Library>;

/** What a source points at on YouTube. `artist` is a YouTube Music artist. */
export const SourceKind = z.enum(['channel', 'artist', 'playlist']);
export type SourceKind = z.infer<typeof SourceKind>;

/** Bounds for "Keep only the last N days"; same as the Settings → Video default. */
export const KEEP_DAYS_MIN = 1;
export const KEEP_DAYS_MAX = 3650;
export const TITLE_FILTER_MAX = 200;

/** Rules for a source in the Video library. */
export const VideoRules = z.object({
  /** "Skip shorts — under 60 s". */
  skipShorts: z.boolean().default(true),
  /** "Keep only the last N days — older files deleted". null keeps files forever. */
  keepDays: z.number().int().min(KEEP_DAYS_MIN).max(KEEP_DAYS_MAX).nullable().default(90),
  /**
   * "Keep everything after a fixed date", as ISO `YYYY-MM-DD`. Only items published on or
   * after this date are downloaded; null means no lower bound. Independent of `keepDays`: the
   * date decides what comes in, the day window decides what retention deletes, and both may be
   * set. The sync maps it to yt-dlp `--dateafter`.
   */
  publishedAfter: z.iso.date().nullable().default(null),
  /**
   * "Only titles matching". A plain case-insensitive substring match on the video title (no
   * wildcards, no regular expressions). null accepts every title.
   */
  titleFilter: z.string().trim().min(1).max(TITLE_FILTER_MAX).nullable().default(null),
  /** Playlists only: number files in playlist order instead of by upload date. */
  syncOrder: z.boolean().default(false),
});
export type VideoRules = z.infer<typeof VideoRules>;

/** Rules for a source in the Music library. */
export const MusicRules = z.object({
  /** "Skip live recordings — title contains 'live'", case-insensitive. */
  skipLiveRecordings: z.boolean().default(false),
  /** "Download full albums — not singles". */
  downloadFullAlbums: z.boolean().default(true),
  /** "Embed cover art — from YouTube Music". */
  embedCoverArt: z.boolean().default(true),
});
export type MusicRules = z.infer<typeof MusicRules>;

export const VideoSourceRules = VideoRules.extend({ library: z.literal('video') });
export type VideoSourceRules = z.infer<typeof VideoSourceRules>;
export const MusicSourceRules = MusicRules.extend({ library: z.literal('music') });
export type MusicSourceRules = z.infer<typeof MusicSourceRules>;

/**
 * A source's rules, tagged with the library they belong to. This is what `sources.rules`
 * stores. Missing fields take their defaults, unknown fields are stripped.
 */
export const Rules = z.discriminatedUnion('library', [VideoSourceRules, MusicSourceRules]);
export type Rules = z.infer<typeof Rules>;

export const DEFAULT_VIDEO_RULES: VideoSourceRules = VideoSourceRules.parse({ library: 'video' });
export const DEFAULT_MUSIC_RULES: MusicSourceRules = MusicSourceRules.parse({ library: 'music' });

/** The default rule set for a library. */
export function defaultRules(library: Library): Rules {
  return library === 'video' ? { ...DEFAULT_VIDEO_RULES } : { ...DEFAULT_MUSIC_RULES };
}

/**
 * The rule chips shown on channel rows and the channel page (handoff Screen 3), in display
 * order. Rules that are off or at their "accept everything" value produce no chip.
 */
export function describeRules(rules: Rules): string[] {
  const chips: string[] = [];
  if (rules.library === 'video') {
    if (rules.skipShorts) chips.push('no shorts');
    if (rules.keepDays !== null) {
      chips.push(`keep ${rules.keepDays} ${rules.keepDays === 1 ? 'day' : 'days'}`);
    }
    if (rules.publishedAfter !== null) chips.push(`since ${rules.publishedAfter}`);
    if (rules.titleFilter !== null) chips.push(`only "${rules.titleFilter}"`);
    if (rules.syncOrder) chips.push('sync order');
  } else {
    if (rules.skipLiveRecordings) chips.push('no live');
    if (rules.downloadFullAlbums) chips.push('full albums');
    if (rules.embedCoverArt) chips.push('cover art');
  }
  return chips;
}

export interface SourceIssue {
  path: string[];
  message: string;
}

/**
 * Combinations of library, kind and rules that are not allowed: rules of the other library,
 * an `artist` outside the Music library, and `syncOrder` on anything but a playlist. Used by
 * `Source` and reusable for create and update inputs. Empty when the combination is valid.
 */
export function sourceIssues(source: {
  library: Library;
  kind: SourceKind;
  rules: Rules;
}): SourceIssue[] {
  const issues: SourceIssue[] = [];
  if (source.rules.library !== source.library) {
    issues.push({ path: ['rules', 'library'], message: `Rules must be ${source.library} rules` });
  }
  if (source.kind === 'artist' && source.library !== 'music') {
    issues.push({ path: ['kind'], message: 'Artists belong to the Music library' });
  }
  if (source.rules.library === 'video' && source.rules.syncOrder && source.kind !== 'playlist') {
    issues.push({ path: ['rules', 'syncOrder'], message: 'Sync order only applies to playlists' });
  }
  return issues;
}

/** ISO 8601 UTC timestamp as stored in the database (`2026-09-24T19:35:10.000Z`). */
const Timestamp = z.iso.datetime();

/**
 * A source as the API returns it: one `sources` row with its rules parsed. Rejects the
 * combinations listed in `sourceIssues`.
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
    rules: Rules,
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
