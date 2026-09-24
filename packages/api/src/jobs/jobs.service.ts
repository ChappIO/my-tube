import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Job, JobType } from '@mytube/shared';
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { HistoryService } from '../activity/history.service.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { jobs, type JobPayload } from '../database/schema.js';
import type { JobOutcome, JobProgress, JobRow } from './job-runner.js';

/** Clock seam for tests (retry backoff compares `run_after` with it). */
export const JOBS_CLOCK = Symbol('JOBS_CLOCK');
export type Clock = () => Date;

/** Delay before retry n (1-based): 1 min, 5 min, 25 min, then 25 min. */
export function retryDelayMs(failedAttempts: number): number {
  const step = Math.min(Math.max(failedAttempts, 1), 3) - 1;
  return 60_000 * 5 ** step;
}

export interface EnqueueInput {
  type: JobType;
  payload: JobPayload;
  /**
   * Identifies the work (`video:<youtube id>`, `source:<id>`). While a job with the same type
   * and key is queued or running, enqueueing returns that job instead of adding one.
   */
  key?: string | null;
  /** Higher runs first; ties run oldest first. Default 0. */
  priority?: number;
  /** Attempts before the job fails for good. Default 3. */
  maxAttempts?: number;
}

export interface EnqueueResult {
  job: JobRow;
  /** False when an existing queued or running job with the same key was returned. */
  created: boolean;
}

type CancelListener = (id: number) => void;

/**
 * The `jobs` table. Every write to it goes through here; `JobsWorker` runs what is queued.
 *
 * - `attempts` counts failed attempts. A failure below `max_attempts` requeues the job with
 *   `run_after` set by `retryDelayMs`; the last one marks it `failed` and records history.
 * - `complete` and `fail` only touch a job that is still `running`, so a job cancelled while
 *   its runner was finishing stays cancelled.
 */
@Injectable()
export class JobsService {
  private readonly cancelListeners = new Set<CancelListener>();
  private readonly enqueueListeners = new Set<() => void>();
  private readonly clock: Clock;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly history: HistoryService,
    @Optional() @Inject(JOBS_CLOCK) clock?: Clock,
  ) {
    this.clock = clock ?? (() => new Date());
  }

  enqueue(input: EnqueueInput): EnqueueResult {
    const key = input.key ?? null;
    const result = this.db.transaction((tx): EnqueueResult => {
      if (key !== null) {
        const existing = tx
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.type, input.type),
              eq(jobs.dedupeKey, key),
              inArray(jobs.status, ['queued', 'running']),
            ),
          )
          .get();
        if (existing) return { job: existing, created: false };
      }
      const now = this.now();
      const job = tx
        .insert(jobs)
        .values({
          type: input.type,
          payload: input.payload,
          dedupeKey: key,
          priority: input.priority ?? 0,
          maxAttempts: input.maxAttempts ?? 3,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return { job, created: true };
    });
    if (result.created) for (const listener of this.enqueueListeners) listener();
    return result;
  }

  get(id: number): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  /**
   * Atomically moves the next runnable queued job of one of `types` to `running`: highest
   * priority, then oldest id, skipping jobs whose `run_after` is in the future.
   */
  claimNext(types: readonly JobType[]): JobRow | undefined {
    if (types.length === 0) return undefined;
    const now = this.now();
    const next = this.db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'queued'),
          inArray(jobs.type, [...types]),
          or(isNull(jobs.runAfter), lte(jobs.runAfter, now)),
        ),
      )
      .orderBy(desc(jobs.priority), asc(jobs.id))
      .limit(1);
    return this.db
      .update(jobs)
      .set({
        status: 'running',
        startedAt: now,
        updatedAt: now,
        runAfter: null,
        progress: null,
        speedBytesPerSec: null,
        etaSeconds: null,
      })
      .where(and(inArray(jobs.id, next), eq(jobs.status, 'queued')))
      .returning()
      .get();
  }

  /** Stores progress of a running job. Values are clamped and rounded for the DTO. */
  updateProgress(id: number, update: JobProgress): void {
    const set: Partial<typeof jobs.$inferInsert> = { updatedAt: this.now() };
    if (update.progress !== undefined) {
      set.progress = update.progress === null ? null : Math.min(1, Math.max(0, update.progress));
    }
    if (update.speedBytesPerSec !== undefined) {
      set.speedBytesPerSec = wholeOrNull(update.speedBytesPerSec);
    }
    if (update.etaSeconds !== undefined) set.etaSeconds = wholeOrNull(update.etaSeconds);
    this.db
      .update(jobs)
      .set(set)
      .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
      .run();
  }

  /** Marks a running job done and records the outcome in history. */
  complete(id: number, outcome: JobOutcome): boolean {
    return this.db.transaction((tx) => {
      const now = this.now();
      const done = tx
        .update(jobs)
        .set({
          status: 'done',
          finishedAt: now,
          updatedAt: now,
          progress: 1,
          speedBytesPerSec: null,
          etaSeconds: null,
          error: null,
        })
        .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
        .returning({ id: jobs.id })
        .get();
      if (!done) return false;
      this.history.record(outcome);
      return true;
    });
  }

  /**
   * Records a failed attempt of a running job. Retries with backoff while attempts remain and
   * `retryable`; otherwise marks it `failed` and records a `failed` history row.
   */
  fail(id: number, error: string, options: { retryable?: boolean } = {}): JobRow | undefined {
    return this.db.transaction((tx) => {
      const job = tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
        .get();
      if (!job) return undefined;
      const attempts = job.attempts + 1;
      const now = this.clock();
      const common = {
        attempts,
        error,
        updatedAt: now.toISOString(),
        progress: null,
        speedBytesPerSec: null,
        etaSeconds: null,
      };
      if ((options.retryable ?? true) && attempts < job.maxAttempts) {
        const runAfter = new Date(now.getTime() + retryDelayMs(attempts)).toISOString();
        return tx
          .update(jobs)
          .set({ ...common, status: 'queued', runAfter, startedAt: null })
          .where(eq(jobs.id, id))
          .returning()
          .get();
      }
      const failed = tx
        .update(jobs)
        .set({ ...common, status: 'failed', finishedAt: now.toISOString() })
        .where(eq(jobs.id, id))
        .returning()
        .get();
      this.history.record({
        kind: job.payload.historyKind ?? 'system',
        title: titleOf(job),
        result: 'failed',
        details: error,
      });
      return failed;
    });
  }

  /**
   * Cancels a queued or running job. A running job's runner is aborted by the worker. Returns
   * the job, or undefined when it does not exist. Finished jobs are returned unchanged.
   */
  cancel(id: number): JobRow | undefined {
    const now = this.now();
    const cancelled = this.db
      .update(jobs)
      .set({ status: 'cancelled', finishedAt: now, updatedAt: now, speedBytesPerSec: null })
      .where(and(eq(jobs.id, id), inArray(jobs.status, ['queued', 'running'])))
      .returning()
      .get();
    if (!cancelled) return this.get(id);
    for (const listener of this.cancelListeners) listener(id);
    return cancelled;
  }

  /** Puts a running job back in the queue without counting an attempt (shutdown). */
  requeue(id: number): void {
    this.db
      .update(jobs)
      .set(requeued(this.now()))
      .where(and(eq(jobs.id, id), eq(jobs.status, 'running')))
      .run();
  }

  /**
   * Jobs left `running` by a crash or a killed container go back to `queued`, attempts
   * unchanged. Called by the worker before it starts. Returns how many were recovered.
   */
  recoverInterrupted(): number {
    return this.db
      .update(jobs)
      .set(requeued(this.now()))
      .where(eq(jobs.status, 'running'))
      .returning({ id: jobs.id })
      .all().length;
  }

  /** Queued and running jobs as the Activity queue shows them: running first, then in order. */
  listQueue(): Job[] {
    return this.db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, ['queued', 'running']))
      .orderBy(sql`${jobs.status} = 'running' DESC`, desc(jobs.priority), asc(jobs.id))
      .all()
      .map(toJobDto);
  }

  /** Number of queued and running jobs (the sidebar badge). */
  activeCount(): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(inArray(jobs.status, ['queued', 'running']))
      .get();
    return row?.count ?? 0;
  }

  /** Called with the job id after a job was cancelled (the worker aborts its runner). */
  onCancel(listener: CancelListener): () => void {
    this.cancelListeners.add(listener);
    return () => this.cancelListeners.delete(listener);
  }

  /** Called after a job was added (the worker polls at once instead of waiting). */
  onEnqueue(listener: () => void): () => void {
    this.enqueueListeners.add(listener);
    return () => this.enqueueListeners.delete(listener);
  }

  private now(): string {
    return this.clock().toISOString();
  }
}

function requeued(now: string) {
  return {
    status: 'queued' as const,
    startedAt: null,
    updatedAt: now,
    progress: null,
    speedBytesPerSec: null,
    etaSeconds: null,
  };
}

function wholeOrNull(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
}

function titleOf(job: JobRow): string {
  const title = job.payload.title;
  return typeof title === 'string' && title.length > 0 ? title : `${job.type} #${job.id}`;
}

/** The Activity queue's view of a row. */
export function toJobDto(job: JobRow): Job {
  const subtitle = job.payload.subtitle;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    title: titleOf(job),
    subtitle: typeof subtitle === 'string' ? subtitle : null,
    progress: job.progress,
    speedBytesPerSec: job.speedBytesPerSec,
    etaSeconds: job.etaSeconds,
    error: job.error,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAfter: job.runAfter,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt,
  };
}
