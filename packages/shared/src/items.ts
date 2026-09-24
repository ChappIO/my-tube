import { z } from 'zod';

/*
 * Items (videos and tracks) and the jobs queue.
 *
 * Every known video or track has a row, whether or not it is on disk. Its status:
 *
 * - `wanted`: accepted by the source's rules, not on disk yet (a download job is queued).
 * - `downloading`: a download job is running for it.
 * - `on_disk`: the file exists at `filePath`.
 * - `missing`: it was on disk and is not any more (rescan found no file, or retention deleted
 *   it). Known but not on disk is what the library screens show as "missing".
 * - `skipped`: the source's rules rejected it when it was fetched; `skipReason` says why.
 */

export const ITEM_STATUSES = ['wanted', 'downloading', 'on_disk', 'missing', 'skipped'] as const;
export const ItemStatus = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof ItemStatus>;

/**
 * Why an item is not downloaded: the rules rejected it when it was fetched (`evaluateItem` in
 * the sync module), or, for `unavailable`, YouTube refused the download for good (removed,
 * private, members-only). Only an explicit retry tries an `unavailable` item again.
 */
export const SKIP_REASONS = [
  'short',
  'title_filter',
  'published_before',
  'older_than_keep_days',
  'live',
  'upcoming',
  'unavailable',
] as const;
export const SkipReason = z.enum(SKIP_REASONS);
export type SkipReason = z.infer<typeof SkipReason>;

export const JOB_TYPES = ['download', 'check_source', 'retention', 'rescan', 'backup'] as const;
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
