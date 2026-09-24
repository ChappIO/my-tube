import type { JobType } from '@mytube/shared';
import type { HistoryKind, jobs } from '../database/schema.js';

/** One `jobs` row as Drizzle reads it. */
export type JobRow = typeof jobs.$inferSelect;

/** Multi-provider token: the array of every registered `JobRunner` (see `JobsModule`). */
export const JOB_RUNNERS = Symbol('JOB_RUNNERS');

/** A progress report from a running job. Omitted fields keep their stored value. */
export interface JobProgress {
  /** 0 to 1. */
  progress?: number | null;
  speedBytesPerSec?: number | null;
  etaSeconds?: number | null;
}

export interface JobContext {
  /**
   * Fires when the job is cancelled or the app shuts down. Pass it to `runner.download()` and
   * friends, and stop soon after it fires (rejecting is fine; the worker knows why).
   */
  signal: AbortSignal;
  /** Report progress; writes are throttled by the worker. */
  progress(update: JobProgress): void;
}

/** What a finished job records in history. */
export interface JobOutcome {
  /** History title: the video or track title, `yt-dlp 2026.09.22 installed`, … */
  title: string;
  /** Short result shown in the history result column: `done`, `2 new`, … */
  result: string;
  kind: HistoryKind;
  details?: string | null;
}

/**
 * Does the work of one job type. Register it in `JobsModule.forRoot({ runners })`; the worker
 * picks runners by `type`, one runner per type.
 *
 * `run` resolves with the outcome (recorded in history as the job completes) or rejects. A
 * rejection is retried with backoff until `max_attempts`, unless it is a `PermanentJobError`.
 */
export interface JobRunner {
  readonly type: JobType;
  run(job: JobRow, ctx: JobContext): Promise<JobOutcome>;
}

/** Throw from a runner when retrying cannot help (a removed video, a bad payload). */
export class PermanentJobError extends Error {
  override readonly name = 'PermanentJobError';
}
