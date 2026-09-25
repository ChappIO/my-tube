import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { JobType } from '@mytube/shared';
import { SettingsService } from '../settings/settings.service.js';
import {
  JOB_RUNNERS,
  PermanentJobError,
  type JobProgress,
  type JobRow,
  type JobRunner,
} from './job-runner.js';
import { JobsService } from './jobs.service.js';

/** How often the worker looks for runnable jobs (it also wakes on enqueue and completion). */
export const POLL_MS = 2_000;
/** Minimum time between two progress writes of one job. */
export const PROGRESS_WRITE_MS = 500;
/** How long shutdown waits for aborted runners to settle. */
const SHUTDOWN_GRACE_MS = 10_000;

type AbortReason = 'cancel' | 'shutdown';

interface Running {
  job: JobRow;
  controller: AbortController;
  done: Promise<void>;
}

/**
 * The in-process worker pool. Every `POLL_MS` (and right after an enqueue or a finished job)
 * it claims runnable jobs: up to `general.downloadsAtOnce` `download` jobs at once (re-read
 * from settings on every poll) and at most one job of every other type. Jobs of a type with
 * no registered runner stay queued.
 *
 * On boot it first returns jobs left `running` by a crash to the queue. On shutdown it aborts
 * running jobs and puts them back in the queue, so they run again on the next boot.
 */
@Injectable()
export class JobsWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('JobsWorker');
  private readonly runners = new Map<JobType, JobRunner>();
  private readonly running = new Map<number, Running>();
  private timer: NodeJS.Timeout | undefined;
  private started = false;
  private kicked = false;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
    @Inject(JOB_RUNNERS) runners: readonly JobRunner[],
  ) {
    for (const runner of runners) {
      if (this.runners.has(runner.type)) {
        throw new Error(`Two job runners registered for type ${runner.type}`);
      }
      this.runners.set(runner.type, runner);
    }
  }

  onApplicationBootstrap(): void {
    this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /** Recovers interrupted jobs and starts polling. */
  start(): void {
    if (this.started) return;
    const recovered = this.jobs.recoverInterrupted();
    if (recovered > 0) this.logger.log(`Requeued ${recovered} interrupted job(s)`);
    this.started = true;
    this.unsubscribe.push(
      this.jobs.onCancel((id) => this.abort(id, 'cancel')),
      this.jobs.onEnqueue(() => this.kick()),
    );
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.timer.unref();
    this.poll();
  }

  /** Stops polling, aborts running jobs and requeues them. */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    clearInterval(this.timer);
    for (const off of this.unsubscribe.splice(0)) off();
    const pending = [...this.running.values()];
    for (const entry of pending) entry.controller.abort('shutdown' satisfies AbortReason);
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(pending.map((entry) => entry.done)),
      new Promise((resolve) => {
        timeout = setTimeout(resolve, SHUTDOWN_GRACE_MS);
        timeout.unref();
      }),
    ]);
    clearTimeout(timeout);
    // Anything still running after the grace period is requeued now; the process is leaving.
    for (const entry of this.running.values()) this.jobs.requeue(entry.job.id);
  }

  /** Ids of the jobs this worker is running. */
  runningIds(): number[] {
    return [...this.running.keys()];
  }

  /** Claims and launches every job that fits the current limits. */
  poll(): void {
    if (!this.started) return;
    try {
      const cap = this.settings.get().general.downloadsAtOnce;
      for (;;) {
        const types = this.claimableTypes(cap);
        if (types.length === 0) return;
        const job = this.jobs.claimNext(types);
        if (!job) return;
        this.launch(job);
      }
    } catch (error) {
      this.logger.error(`Poll failed: ${message(error)}`);
    }
  }

  private claimableTypes(downloadCap: number): JobType[] {
    const busy = new Map<JobType, number>();
    for (const { job } of this.running.values()) busy.set(job.type, (busy.get(job.type) ?? 0) + 1);
    const types: JobType[] = [];
    for (const type of this.runners.keys()) {
      const limit = type === 'download' ? downloadCap : 1;
      if ((busy.get(type) ?? 0) < limit) types.push(type);
    }
    return types;
  }

  private launch(job: JobRow): void {
    const runner = this.runners.get(job.type)!;
    const controller = new AbortController();
    let lastWrite = 0;
    let lastStage: string | null = null;
    const progress = (update: JobProgress) => {
      const now = Date.now();
      // A new stage (merging, moving the file, …) is written at once: post-processing steps are
      // few and short, and the queue should not keep showing the previous one.
      const stageChanged = update.stage !== undefined && (update.stage || null) !== lastStage;
      if (now - lastWrite < PROGRESS_WRITE_MS && update.progress !== 1 && !stageChanged) return;
      lastWrite = now;
      if (update.stage !== undefined) lastStage = update.stage || null;
      this.jobs.updateProgress(job.id, update);
    };

    const execute = async () => {
      try {
        const outcome = await runner.run(job, { signal: controller.signal, progress });
        if (controller.signal.aborted) this.settleAborted(job, controller);
        else this.jobs.complete(job.id, outcome);
      } catch (error) {
        if (controller.signal.aborted) {
          this.settleAborted(job, controller);
        } else {
          const retryable = !(error instanceof PermanentJobError);
          const failed = this.jobs.fail(job.id, message(error), { retryable });
          const final = failed?.status === 'failed';
          this.logger.warn(
            `Job ${job.id} (${job.type}) failed${final ? '' : ', will retry'}: ${message(error)}`,
          );
        }
      } finally {
        this.running.delete(job.id);
        this.kick();
      }
    };

    // Registered before the runner starts, so a synchronous completion still finds it.
    const entry: Running = { job, controller, done: Promise.resolve() };
    this.running.set(job.id, entry);
    entry.done = execute();
  }

  private settleAborted(job: JobRow, controller: AbortController): void {
    // A cancel already marked the row `cancelled`; a shutdown puts it back in the queue.
    const reason: unknown = controller.signal.reason;
    if (reason === 'shutdown') this.jobs.requeue(job.id);
  }

  private abort(id: number, reason: AbortReason): void {
    this.running.get(id)?.controller.abort(reason);
  }

  /** Polls soon (coalesced), after an enqueue or a finished job. */
  private kick(): void {
    if (!this.started || this.kicked) return;
    this.kicked = true;
    queueMicrotask(() => {
      this.kicked = false;
      this.poll();
    });
  }
}

function message(error: unknown): string {
  if (error instanceof Error) {
    // YtdlpError carries the last `ERROR:` line as `reason`, which reads better in history.
    const reason = 'reason' in error ? error.reason : undefined;
    return typeof reason === 'string' && reason.length > 0 ? reason : error.message;
  }
  return String(error);
}
