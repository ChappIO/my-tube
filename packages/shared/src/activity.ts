import { z } from 'zod';

/*
 * The Activity screen: the queue (`Job` in items.ts), the history and the badge summary.
 */

/** The history kind chip. */
export const HISTORY_KINDS = ['video', 'music', 'system'] as const;
export const HistoryKind = z.enum(HISTORY_KINDS);
export type HistoryKind = z.infer<typeof HistoryKind>;

/** One `history` row: a finished download, a file removed by revalidation, a yt-dlp install or update. */
export const HistoryEntry = z.object({
  id: z.number().int().positive(),
  /** ISO 8601 UTC. */
  at: z.iso.datetime(),
  kind: HistoryKind,
  /** A video or track title, `yt-dlp 2026.09.22 installed`, a source name. */
  title: z.string(),
  /** `done`, `installed`, `updated`, `failed`, `removed`, … */
  result: z.string(),
  /** Free text: the file path of a download, an error message, `no longer matches: <condition>`. */
  details: z.string().nullable(),
  /** The job that produced the row; its yt-dlp output is at `GET /api/jobs/:id/log`. */
  jobId: z.number().int().positive().nullable(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/** `GET /api/activity/history?limit=` (1 to 500, default 100). */
export const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type HistoryQuery = z.infer<typeof HistoryQuery>;

/** `GET /api/activity/summary`: the sidebar badge. */
export const ActivitySummary = z.object({
  /** Download jobs queued or running: the Activity badge count. */
  activeDownloads: z.number().int().nonnegative(),
  /** Jobs of any type waiting for a slot (queued, including retries that wait). */
  queued: z.number().int().nonnegative(),
});
export type ActivitySummary = z.infer<typeof ActivitySummary>;
