import { z } from 'zod';

/*
 * Items (videos and tracks) and the jobs queue.
 *
 * Every known video or track has a row, whether or not it is on disk. Its status:
 *
 * - `wanted`: accepted by the source's rules, not on disk yet (a download job is queued).
 * - `downloading`: a download job is running for it.
 * - `on_disk`: the file exists at `filePath`.
 * - `missing`: it was on disk and is not any more (a rescan found no file). Known but not on
 *   disk is what the library screens show as "missing".
 * - `skipped`: the source's rules do not match it; `skipReason` says why. Revalidation moves
 *   a file the rules no longer match here too (`no_longer_matches`, file removed).
 */

export const ITEM_STATUSES = ['wanted', 'downloading', 'on_disk', 'missing', 'skipped'] as const;
export const ItemStatus = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof ItemStatus>;

/**
 * Why an item is not downloaded:
 *
 * - `no_match`: the source's rules (its matcher) did not match it at sync.
 * - `no_longer_matches`: it was on disk and revalidation removed the file because the current
 *   rules no longer match it.
 * - `live`, `upcoming`: a stream on air or a premiere that has not aired. Never stored: the
 *   sync looks at them again on the next check.
 * - `unavailable`: YouTube refused the download for good (removed, private, members-only).
 *   Only an explicit retry tries it again.
 * - `deleted_by_user`: the file was deleted with Preview's Delete file (removed with Preview when
 *   the video player came; kept for the rows it left). Nothing brings it back on its own:
 *   neither the sync nor revalidation changes it.
 *
 * A later sync or revalidation moves `no_match` and `no_longer_matches` items back to `wanted`
 * when the rules match them again.
 */
export const SKIP_REASONS = [
  'no_match',
  'no_longer_matches',
  'live',
  'upcoming',
  'unavailable',
  'deleted_by_user',
] as const;
export const SkipReason = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof SkipReason>;

export const JOB_TYPES = ['download', 'check_source', 'revalidate', 'rescan', 'backup'] as const;
export const JobType = z.enum(JOB_TYPES);
export type JobType = z.infer<typeof JobType>;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

/** ISO 8601 UTC timestamp as stored in the database. */
const Timestamp = z.iso.datetime();

/** One job as the Activity queue renders it. */
export const Job = z.object({
  id: z.number().int().positive(),
  type: JobType,
  status: JobStatus,
  /** What the job works on: a video or track title, a source name, "Rescan libraries". */
  title: z.string(),
  /** Secondary line: the channel or artist, or null. */
  subtitle: z.string().nullable(),
  /** 0 to 1 while running and known, else null. */
  progress: z.number().min(0).max(1).nullable(),
  speedBytesPerSec: z.number().int().nonnegative().nullable(),
  etaSeconds: z.number().int().nonnegative().nullable(),
  /** Expected size in bytes of what a download fetches (all streams), once yt-dlp knows it. */
  totalBytes: z.number().int().nonnegative().nullable(),
  /**
   * The yt-dlp post-processor a download is running (`Merger`, `MoveFiles`, …) once its bytes
   * are in, else null.
   */
  stage: z.string().nullable(),
  /** Short fact for the queue meta line, such as the quality (`1080p`), or null. */
  detail: z.string().nullable(),
  /** Error of the last failed attempt (kept while a retry waits). */
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  /** A retry waits until this time; null runs as soon as a slot is free. */
  runAfter: Timestamp.nullable(),
  createdAt: Timestamp,
  startedAt: Timestamp.nullable(),
  finishedAt: Timestamp.nullable(),
  updatedAt: Timestamp,
});
export type Job = z.infer<typeof Job>;

const itemFields = {
  id: z.number().int().positive(),
  sourceId: z.number().int().positive().nullable(),
  youtubeId: z.string().min(1),
  title: z.string(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  /** `YYYY-MM-DD` upload date, or an ISO timestamp when YouTube gives one. */
  publishedAt: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  status: ItemStatus,
  skipReason: SkipReason.nullable(),
  /** Relative to the library mount. */
  filePath: z.string().nullable(),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  downloadedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
};

/** A known video (one `videos` row). */
export const Video = z.object({
  ...itemFields,
  channelId: z.number().int().positive(),
  isShort: z.boolean(),
  liveStatus: z.string().nullable(),
});
export type Video = z.infer<typeof Video>;

/** A known track (one `tracks` row). */
export const Track = z.object({
  ...itemFields,
  albumId: z.number().int().positive().nullable(),
  artistId: z.number().int().positive(),
  trackNumber: z.number().int().positive().nullable(),
  discNumber: z.number().int().positive().nullable(),
});
export type Track = z.infer<typeof Track>;
