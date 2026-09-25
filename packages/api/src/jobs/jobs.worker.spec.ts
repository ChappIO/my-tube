import type { JobType } from '@mytube/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createJobsHarness, deferred, flush } from '../../test/jobs-harness.js';
import {
  PermanentJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from './job-runner.js';
import { JobsWorker } from './jobs.worker.js';

interface Call {
  job: JobRow;
  ctx: JobContext;
  finish: (outcome?: Partial<JobOutcome>) => void;
  fail: (error: unknown) => void;
}

/**
 * A runner whose jobs finish when the test says so. An aborted signal rejects the run, like
 * the yt-dlp runner does.
 */
class FakeRunner implements JobRunner {
  readonly calls: Call[] = [];
  constructor(readonly type: JobType) {}

  run(job: JobRow, ctx: JobContext): Promise<JobOutcome> {
    const { promise, resolve, reject } = deferred<JobOutcome>();
    ctx.signal.addEventListener('abort', () => reject(new Error('aborted')));
    this.calls.push({
      job,
      ctx,
      finish: (outcome) =>
        resolve({ title: job.payload.title, result: 'done', kind: 'video', ...outcome }),
      fail: reject,
    });
    return promise;
  }

  titles(): string[] {
    return this.calls.map((call) => call.job.payload.title);
  }
}

const workers: JobsWorker[] = [];

function setup(downloadsAtOnce = 2) {
  const harness = createJobsHarness();
  harness.settings.patch({ general: { downloadsAtOnce } });
  const download = new FakeRunner('download');
  const check = new FakeRunner('check_source');
  const worker = new JobsWorker(harness.jobs, harness.settings, [download, check]);
  workers.push(worker);
  const enqueue = (type: JobType, title: string, extra: { priority?: number } = {}) =>
    harness.jobs.enqueue({ type, payload: { title }, ...extra }).job;
  return { ...harness, download, check, worker, enqueue };
}

afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.stop();
});

describe('JobsWorker', () => {
  it('runs jobs by priority, then in enqueue order', async () => {
    const { worker, download, enqueue } = setup(1);
    enqueue('download', 'a');
    enqueue('download', 'b');
    enqueue('download', 'urgent', { priority: 1 });
    enqueue('download', 'c');

    worker.start();
    for (let i = 0; i < 4; i++) {
      download.calls.at(-1)!.finish();
      await flush();
    }
    expect(download.titles()).toEqual(['urgent', 'a', 'b', 'c']);
  });

  it('respects downloads-at-once and re-reads it from settings', async () => {
    const { worker, download, enqueue, settings } = setup(2);
    for (const title of ['1', '2', '3', '4', '5']) enqueue('download', title);

    worker.start();
    expect(download.titles()).toEqual(['1', '2']);
    expect(worker.runningIds()).toHaveLength(2);

    settings.patch({ general: { downloadsAtOnce: 3 } });
    worker.poll();
    expect(download.titles()).toEqual(['1', '2', '3']);

    // Lowering the cap lets running jobs finish and starts nothing until below it.
    settings.patch({ general: { downloadsAtOnce: 1 } });
    download.calls[0]!.finish();
    await flush();
    expect(download.calls).toHaveLength(3);
    download.calls[1]!.finish();
    download.calls[2]!.finish();
    await flush();
    expect(download.titles()).toEqual(['1', '2', '3', '4']);
    expect(worker.runningIds()).toHaveLength(1);
  });

  it('runs at most one job of every other type, alongside downloads', async () => {
    const { worker, download, check, enqueue } = setup(2);
    enqueue('check_source', 'src 1');
    enqueue('check_source', 'src 2');
    enqueue('download', 'video');

    worker.start();
    expect(check.titles()).toEqual(['src 1']);
    expect(download.titles()).toEqual(['video']);

    check.calls[0]!.finish({ kind: 'system' });
    await flush();
    expect(check.titles()).toEqual(['src 1', 'src 2']);
  });

  it('leaves jobs without a runner queued', () => {
    const { worker, jobs, enqueue } = setup();
    const job = enqueue('rescan', 'Rescan libraries');
    worker.start();
    expect(jobs.get(job.id)?.status).toBe('queued');
  });

  it('picks up new jobs as they are enqueued', async () => {
    const { worker, download, enqueue } = setup();
    worker.start();
    enqueue('download', 'late');
    await flush();
    expect(download.titles()).toEqual(['late']);
  });

  it('completes jobs with a history row and throttled progress', async () => {
    const { worker, download, jobs, history, enqueue } = setup();
    const job = enqueue('download', 'Clip');
    worker.start();

    const { ctx, finish } = download.calls[0]!;
    ctx.progress({ progress: 0.25, speedBytesPerSec: 2_000_000, etaSeconds: 30 });
    ctx.progress({ progress: 0.26 }); // within the throttle window: dropped
    expect(jobs.listQueue()[0]).toMatchObject({
      status: 'running',
      progress: 0.25,
      speedBytesPerSec: 2_000_000,
      etaSeconds: 30,
    });
    // A new post-processing stage is written at once, inside the window too; a repeat is not.
    ctx.progress({ progress: 0.911, stage: 'Merger', speedBytesPerSec: null });
    expect(jobs.listQueue()[0]).toMatchObject({ progress: 0.911, stage: 'Merger' });
    ctx.progress({ progress: 0.93, stage: 'Merger' });
    expect(jobs.listQueue()[0]).toMatchObject({ progress: 0.911, stage: 'Merger' });
    ctx.progress({ progress: 0.922, stage: 'MoveFiles' });
    expect(jobs.listQueue()[0]).toMatchObject({ progress: 0.922, stage: 'MoveFiles' });

    finish({ title: 'Clip', result: 'done', kind: 'video', details: '12 MB' });
    await flush();
    expect(jobs.get(job.id)).toMatchObject({ status: 'done', progress: 1, stage: null });
    expect(history.recent()).toMatchObject([
      { kind: 'video', title: 'Clip', result: 'done', details: '12 MB' },
    ]);
    expect(worker.runningIds()).toEqual([]);
  });

  it('retries a failure after the backoff and fails for good at the last attempt', async () => {
    const { worker, download, jobs, history, enqueue, advance } = setup();
    const job = enqueue('download', 'Flaky');
    worker.start();

    download.calls[0]!.fail(new Error('HTTP Error 503'));
    await flush();
    expect(jobs.get(job.id)).toMatchObject({ status: 'queued', attempts: 1 });
    expect(download.calls).toHaveLength(1); // waits for run_after

    advance(60_000);
    worker.poll();
    expect(download.calls).toHaveLength(2);
    download.calls[1]!.fail(new Error('HTTP Error 503'));
    await flush();
    advance(5 * 60_000);
    worker.poll();
    download.calls[2]!.fail(Object.assign(new Error('exit 1'), { reason: 'Video unavailable' }));
    await flush();

    expect(jobs.get(job.id)).toMatchObject({
      status: 'failed',
      attempts: 3,
      error: 'Video unavailable',
    });
    expect(history.recent()).toMatchObject([
      { kind: 'system', title: 'Flaky', result: 'failed', details: 'Video unavailable' },
    ]);
    advance(60 * 60_000);
    worker.poll();
    expect(download.calls).toHaveLength(3);
  });

  it('does not retry a PermanentJobError', async () => {
    const { worker, download, jobs, enqueue } = setup();
    const job = enqueue('download', 'Gone');
    worker.start();
    download.calls[0]!.fail(new PermanentJobError('removed by the uploader'));
    await flush();
    expect(jobs.get(job.id)).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('cancels a running job: aborts its runner and frees the slot', async () => {
    const { worker, download, jobs, history, enqueue } = setup(1);
    const first = enqueue('download', 'first');
    enqueue('download', 'second');
    worker.start();
    const { ctx } = download.calls[0]!;

    jobs.cancel(first.id);
    expect(ctx.signal.aborted).toBe(true);
    await flush();

    expect(jobs.get(first.id)).toMatchObject({ status: 'cancelled', attempts: 0 });
    expect(history.recent()).toEqual([]);
    expect(download.titles()).toEqual(['first', 'second']);
  });

  it('keeps a cancelled job cancelled when its runner resolves anyway', async () => {
    const { worker, download, jobs, history, enqueue } = setup();
    const job = enqueue('download', 'stubborn');
    worker.start();
    jobs.cancel(job.id);
    download.calls[0]!.finish();
    await flush();
    expect(jobs.get(job.id)?.status).toBe('cancelled');
    expect(history.recent()).toEqual([]);
  });

  it('requeues jobs left running by a crash when it starts', () => {
    const { worker, download, jobs, enqueue, advance } = setup();
    const job = enqueue('download', 'interrupted');
    jobs.claimNext(['download']);
    jobs.fail(job.id, 'first try');
    advance(60_000);
    jobs.claimNext(['download']); // the process "dies" here
    expect(jobs.get(job.id)?.status).toBe('running');

    worker.start();
    expect(download.titles()).toEqual(['interrupted']);
    expect(jobs.get(job.id)).toMatchObject({ status: 'running', attempts: 1 });
  });

  it('aborts and requeues running jobs on shutdown', async () => {
    const { worker, download, jobs, enqueue } = setup();
    const job = enqueue('download', 'long');
    worker.start();
    const { ctx } = download.calls[0]!;

    await worker.stop();
    expect(ctx.signal.aborted).toBe(true);
    expect(jobs.get(job.id)).toMatchObject({ status: 'queued', attempts: 0 });

    // Stopped: nothing new starts.
    enqueue('download', 'after');
    worker.poll();
    await flush();
    expect(download.calls).toHaveLength(1);
  });

  it('rejects two runners for one type', () => {
    const { jobs, settings } = createJobsHarness();
    expect(
      () =>
        new JobsWorker(jobs, settings, [new FakeRunner('download'), new FakeRunner('download')]),
    ).toThrow(/Two job runners/);
  });
});
