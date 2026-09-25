import { Job } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { retryDelayMs } from './jobs.service.js';

const MINUTE = 60_000;

describe('JobsService', () => {
  it('enqueues with defaults and lists the queue as shared DTOs', () => {
    const { jobs } = createJobsHarness();
    const { job, created } = jobs.enqueue({
      type: 'download',
      payload: { title: 'Hand-cut dovetails', subtitle: 'Woodshop', videoId: 7 },
      key: 'video:abc',
    });
    expect(created).toBe(true);
    expect(job).toMatchObject({
      status: 'queued',
      priority: 0,
      attempts: 0,
      maxAttempts: 3,
      dedupeKey: 'video:abc',
      payload: { title: 'Hand-cut dovetails', subtitle: 'Woodshop', videoId: 7 },
    });

    const queue = jobs.listQueue();
    expect(queue).toHaveLength(1);
    expect(Job.parse(queue[0])).toEqual({
      id: job.id,
      type: 'download',
      status: 'queued',
      title: 'Hand-cut dovetails',
      subtitle: 'Woodshop',
      progress: null,
      speedBytesPerSec: null,
      etaSeconds: null,
      totalBytes: null,
      stage: null,
      detail: null,
      error: null,
      attempts: 0,
      maxAttempts: 3,
      runAfter: null,
      createdAt: '2026-09-24T12:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      updatedAt: '2026-09-24T12:00:00.000Z',
    });
    expect(jobs.activeCount()).toBe(1);
  });

  it('de-duplicates by type and key while queued or running, not after', () => {
    const { jobs } = createJobsHarness();
    const first = jobs.enqueue({ type: 'download', payload: { title: 'a' }, key: 'video:a' });
    const again = jobs.enqueue({ type: 'download', payload: { title: 'a' }, key: 'video:a' });
    expect(again).toEqual({ job: first.job, created: false });

    // Same key, other type: a separate job. No key: never de-duplicated.
    expect(
      jobs.enqueue({ type: 'check_source', payload: { title: 'a' }, key: 'video:a' }).created,
    ).toBe(true);
    expect(jobs.enqueue({ type: 'rescan', payload: { title: 'r' } }).created).toBe(true);
    expect(jobs.enqueue({ type: 'rescan', payload: { title: 'r' } }).created).toBe(true);

    jobs.claimNext(['download']);
    expect(
      jobs.enqueue({ type: 'download', payload: { title: 'a' }, key: 'video:a' }).created,
    ).toBe(false);

    jobs.complete(first.job.id, { title: 'a', result: 'done', kind: 'video' });
    expect(
      jobs.enqueue({ type: 'download', payload: { title: 'a' }, key: 'video:a' }).created,
    ).toBe(true);
  });

  it('enforces the de-dup key in the database too', () => {
    const { client } = createJobsHarness();
    const insert = client.prepare(
      "INSERT INTO jobs (type, payload, dedupe_key, status) VALUES ('download', '{}', 'k', ?)",
    );
    insert.run('done');
    insert.run('queued');
    expect(() => insert.run('running')).toThrow(/UNIQUE/);
    expect(() =>
      client.prepare("INSERT INTO jobs (type, payload) VALUES ('download', 'not json')").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      client.prepare("INSERT INTO jobs (type, payload) VALUES ('x', '{}')").run(),
    ).toThrow(/CHECK/);
  });

  it('claims by priority, then oldest first', () => {
    const { jobs } = createJobsHarness();
    const a = jobs.enqueue({ type: 'download', payload: { title: 'a' } }).job;
    const b = jobs.enqueue({ type: 'download', payload: { title: 'b' } }).job;
    const urgent = jobs.enqueue({ type: 'download', payload: { title: 'c' }, priority: 5 }).job;
    const other = jobs.enqueue({ type: 'rescan', payload: { title: 'r' }, priority: 9 }).job;

    expect(jobs.claimNext(['download'])?.id).toBe(urgent.id);
    expect(jobs.claimNext(['download'])?.id).toBe(a.id);
    expect(jobs.claimNext(['download'])?.id).toBe(b.id);
    expect(jobs.claimNext(['download'])).toBeUndefined();
    expect(jobs.claimNext([])).toBeUndefined();
    const claimed = jobs.claimNext(['download', 'rescan']);
    expect(claimed).toMatchObject({
      id: other.id,
      status: 'running',
      startedAt: '2026-09-24T12:00:00.000Z',
    });

    // Running first, then queued; each in pick order.
    const c = jobs.enqueue({ type: 'backup', payload: { title: 'later' } }).job;
    const d = jobs.enqueue({ type: 'backup', payload: { title: 'first' }, priority: 1 }).job;
    expect(jobs.listQueue().map((job) => job.id)).toEqual([
      other.id,
      urgent.id,
      a.id,
      b.id,
      d.id,
      c.id,
    ]);
  });

  it('updates progress of running jobs only, clamped and rounded', () => {
    const { jobs } = createJobsHarness();
    const job = jobs.enqueue({ type: 'download', payload: { title: 'a' } }).job;
    jobs.updateProgress(job.id, { progress: 0.5 });
    expect(jobs.get(job.id)?.progress).toBeNull();

    jobs.claimNext(['download']);
    jobs.updateProgress(job.id, { progress: 0.42, speedBytesPerSec: 1234.6, etaSeconds: 12.2 });
    expect(jobs.listQueue()[0]).toMatchObject({
      progress: 0.42,
      speedBytesPerSec: 1235,
      etaSeconds: 12,
    });
    jobs.updateProgress(job.id, { progress: 1.7 });
    expect(jobs.listQueue()[0]).toMatchObject({ progress: 1, speedBytesPerSec: 1235 });
  });

  it('completes a running job and records history', () => {
    const { jobs, history } = createJobsHarness();
    const job = jobs.enqueue({ type: 'download', payload: { title: 'a' } }).job;
    // Not running yet: nothing happens.
    expect(jobs.complete(job.id, { title: 'a', result: 'done', kind: 'video' })).toBe(false);
    jobs.claimNext(['download']);
    expect(jobs.complete(job.id, { title: 'Clip', result: 'done', kind: 'video' })).toBe(true);
    expect(jobs.get(job.id)).toMatchObject({ status: 'done', progress: 1 });
    expect(history.recent()).toMatchObject([{ kind: 'video', title: 'Clip', result: 'done' }]);
    expect(jobs.listQueue()).toEqual([]);
  });

  it('retries with 1, 5 and 25 minute backoff, then fails with a history row', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([MINUTE, 5 * MINUTE, 25 * MINUTE, 25 * MINUTE]);

    const { jobs, history, advance, now } = createJobsHarness();
    const job = jobs.enqueue({
      type: 'download',
      payload: { title: 'Flaky', historyKind: 'music' },
      maxAttempts: 4,
    }).job;

    const delays = [MINUTE, 5 * MINUTE, 25 * MINUTE];
    for (const [index, delay] of delays.entries()) {
      expect(jobs.claimNext(['download'])?.id).toBe(job.id);
      const retried = jobs.fail(job.id, `boom ${index + 1}`);
      expect(retried).toMatchObject({ status: 'queued', attempts: index + 1 });
      expect(retried?.runAfter).toBe(new Date(now().getTime() + delay).toISOString());
      // Not before run_after.
      advance(delay - 1);
      expect(jobs.claimNext(['download'])).toBeUndefined();
      advance(1);
    }
    expect(jobs.listQueue()[0]).toMatchObject({ error: 'boom 3', attempts: 3 });

    expect(jobs.claimNext(['download'])?.id).toBe(job.id);
    expect(jobs.fail(job.id, 'boom 4')).toMatchObject({ status: 'failed', attempts: 4 });
    expect(history.recent()).toMatchObject([
      { kind: 'music', title: 'Flaky', result: 'failed', details: 'boom 4' },
    ]);
    expect(jobs.listQueue()).toEqual([]);
  });

  it('fails at once when not retryable', () => {
    const { jobs, history } = createJobsHarness();
    const job = jobs.enqueue({ type: 'rescan', payload: { title: 'Rescan libraries' } }).job;
    jobs.claimNext(['rescan']);
    expect(jobs.fail(job.id, 'bad payload', { retryable: false })).toMatchObject({
      status: 'failed',
      attempts: 1,
    });
    expect(history.recent()).toMatchObject([
      { kind: 'system', title: 'Rescan libraries', result: 'failed' },
    ]);
  });

  it('cancels queued and running jobs and notifies listeners', () => {
    const { jobs } = createJobsHarness();
    const notified: number[] = [];
    jobs.onCancel((id) => notified.push(id));
    const queued = jobs.enqueue({ type: 'download', payload: { title: 'q' } }).job;
    const running = jobs.enqueue({ type: 'rescan', payload: { title: 'r' } }).job;
    jobs.claimNext(['rescan']);

    expect(jobs.cancel(queued.id)?.status).toBe('cancelled');
    expect(jobs.cancel(running.id)?.status).toBe('cancelled');
    expect(notified).toEqual([queued.id, running.id]);
    // A cancelled job stays cancelled even if its runner finishes afterwards.
    expect(jobs.complete(running.id, { title: 'r', result: 'done', kind: 'system' })).toBe(false);
    expect(jobs.fail(running.id, 'late')).toBeUndefined();
    expect(jobs.cancel(running.id)?.status).toBe('cancelled');
    expect(notified).toHaveLength(2);
    expect(jobs.cancel(999)).toBeUndefined();
    expect(jobs.claimNext(['download'])).toBeUndefined();
  });

  it('recovers interrupted jobs with attempts unchanged', () => {
    const { jobs, advance } = createJobsHarness();
    const job = jobs.enqueue({ type: 'download', payload: { title: 'a' } }).job;
    jobs.claimNext(['download']);
    jobs.fail(job.id, 'once');
    advance(MINUTE);
    // The retry starts and the process dies mid-download.
    jobs.claimNext(['download']);
    jobs.updateProgress(job.id, { progress: 0.3, speedBytesPerSec: 100, etaSeconds: 5 });

    expect(jobs.recoverInterrupted()).toBe(1);
    expect(jobs.get(job.id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      startedAt: null,
      progress: null,
      speedBytesPerSec: null,
      etaSeconds: null,
    });
    expect(jobs.recoverInterrupted()).toBe(0);
    expect(jobs.claimNext(['download'])?.id).toBe(job.id);
  });

  it('completes without history for a null outcome and links history rows to the job', () => {
    const { jobs, history } = createJobsHarness();
    const quiet = jobs.enqueue({ type: 'check_source', payload: { title: 'NASA' } }).job;
    jobs.claimNext(['check_source']);
    expect(jobs.complete(quiet.id, null)).toBe(true);
    expect(history.recent()).toEqual([]);

    const loud = jobs.enqueue({ type: 'download', payload: { title: 'Clip' } }).job;
    jobs.claimNext(['download']);
    jobs.complete(loud.id, { title: 'Clip', result: 'done', kind: 'video' });
    const failing = jobs.enqueue({ type: 'download', payload: { title: 'Bad' } }).job;
    jobs.claimNext(['download']);
    jobs.fail(failing.id, 'gone', { retryable: false });
    expect(history.recent().map((entry) => [entry.title, entry.jobId])).toEqual([
      ['Bad', failing.id],
      ['Clip', loud.id],
    ]);
  });

  it('stores the post-processing stage while running and clears it when the job moves on', () => {
    const { jobs } = createJobsHarness();
    const a = jobs.enqueue({ type: 'download', key: 'video:a', payload: { title: 'A' } }).job;
    const b = jobs.enqueue({ type: 'download', key: 'video:b', payload: { title: 'B' } }).job;
    jobs.claimNext(['download']);
    jobs.claimNext(['download']);
    const stage = (id: number) => jobs.get(id)?.stage;

    jobs.updateProgress(a.id, { progress: 0.911, stage: 'Merger' });
    expect(jobs.listQueue().find((job) => job.id === a.id)).toMatchObject({
      progress: 0.911,
      stage: 'Merger',
    });
    // Omitted keeps it; null or empty clears it.
    jobs.updateProgress(a.id, { progress: 0.92 });
    expect(stage(a.id)).toBe('Merger');
    jobs.updateProgress(a.id, { stage: '' });
    expect(stage(a.id)).toBeNull();

    jobs.updateProgress(a.id, { stage: 'MoveFiles' });
    jobs.complete(a.id, null);
    expect(jobs.get(a.id)).toMatchObject({ status: 'done', progress: 1, stage: null });

    // A failed attempt requeues without it, and a new claim starts clean.
    jobs.updateProgress(b.id, { stage: 'Merger' });
    expect(jobs.fail(b.id, 'ffmpeg exited')).toMatchObject({ status: 'queued', stage: null });
  });

  it('shows recent failures in the queue view until retried, dismissed or superseded', () => {
    const { jobs, advance } = createJobsHarness();
    const failed = jobs.enqueue({ type: 'download', key: 'video:a', payload: { title: 'A' } }).job;
    jobs.claimNext(['download']);
    jobs.updateProgress(failed.id, { totalBytes: 1234.4 });
    expect(jobs.listQueue()[0]?.totalBytes).toBe(1234);
    jobs.fail(failed.id, 'gone', { retryable: false });
    jobs.enqueue({ type: 'download', key: 'video:b', payload: { title: 'B', detail: '720p' } });

    expect(jobs.queueView().map((job) => [job.title, job.status, job.detail])).toEqual([
      ['B', 'queued', '720p'],
      ['A', 'failed', null],
    ]);
    expect(jobs.summary()).toEqual({ activeDownloads: 1, queued: 1 });
    expect(jobs.latestForKey('download', 'video:a')?.status).toBe('failed');

    // Retry: back in the queue as a fresh job.
    const retried = jobs.retry(failed.id);
    expect(retried).toMatchObject({ status: 'queued', attempts: 0, error: null, finishedAt: null });
    expect(jobs.summary()).toEqual({ activeDownloads: 2, queued: 2 });

    // Dismiss (cancel) a failed job: it leaves the view.
    jobs.claimNext(['download']);
    jobs.fail(failed.id, 'gone again', { retryable: false });
    expect(jobs.cancel(failed.id)?.status).toBe('cancelled');
    expect(jobs.queueView().map((job) => job.title)).toEqual(['B']);

    // A failure older than a day drops out; a newer job with the same key supersedes one.
    const old = jobs.enqueue({ type: 'download', key: 'video:c', payload: { title: 'C' } }).job;
    jobs.claimNext(['download']);
    jobs.claimNext(['download']);
    jobs.fail(old.id, 'x', { retryable: false });
    expect(jobs.queueView().map((job) => job.title)).toContain('C');
    advance(25 * 3_600_000);
    expect(jobs.queueView().map((job) => job.title)).not.toContain('C');
  });

  it('retries only failed or cancelled jobs and defers to an active job with the same key', () => {
    const { jobs } = createJobsHarness();
    const first = jobs.enqueue({ type: 'download', key: 'video:a', payload: { title: 'A' } }).job;
    expect(jobs.retry(first.id)?.status).toBe('queued'); // unchanged
    jobs.cancel(first.id);
    const second = jobs.enqueue({ type: 'download', key: 'video:a', payload: { title: 'A' } }).job;
    expect(jobs.retry(first.id)?.id).toBe(second.id);
    expect(jobs.get(first.id)?.status).toBe('cancelled');
    expect(jobs.retry(999)).toBeUndefined();
  });

  it('retries the failed jobs the queue shows, skipping superseded ones and active keys', () => {
    const { jobs, advance } = createJobsHarness();
    const notified: number[] = [];
    jobs.onEnqueue(() => notified.push(1));
    const failWith = (type: 'download' | 'rescan', key: string | null, title: string) => {
      const job = jobs.enqueue({ type, key, payload: { title } }).job;
      expect(jobs.claimNext([type])?.id).toBe(job.id);
      jobs.fail(job.id, `${title} broke`, { retryable: false });
      return job;
    };
    // Failed more than a day ago: out of the queue view, so Retry all leaves it too.
    const stale = failWith('download', 'video:old', 'Old');
    advance(25 * 3_600_000);
    const a = failWith('download', 'video:a', 'A');
    const b = failWith('download', 'video:b', 'B');
    const check = failWith('rescan', null, 'Rescan');
    // Superseded: a newer job with the same key failed after it (only the newer one counts).
    const oldC = failWith('download', 'video:c', 'C');
    const newC = failWith('download', 'video:c', 'C');
    const done = jobs.enqueue({ type: 'download', key: 'video:e', payload: { title: 'E' } }).job;
    jobs.claimNext(['download']);
    jobs.complete(done.id, null);
    // A key that is already queued again (an older cancelled job, retried) is left alone.
    const cancelled = jobs.enqueue({ type: 'download', key: 'video:d', payload: { title: 'D' } });
    jobs.cancel(cancelled.job.id);
    const d = failWith('download', 'video:d', 'D');
    expect(jobs.retry(cancelled.job.id)?.status).toBe('queued');
    notified.length = 0;

    expect(jobs.retryFailed('download')).toBe(3);
    for (const id of [a.id, b.id, newC.id]) {
      expect(jobs.get(id)).toMatchObject({
        status: 'queued',
        attempts: 0,
        error: null,
        runAfter: null,
        finishedAt: null,
        startedAt: null,
      });
    }
    expect(jobs.get(oldC.id)?.status).toBe('failed');
    expect(jobs.get(stale.id)?.status).toBe('failed');
    expect(jobs.get(d.id)?.status).toBe('failed');
    expect(jobs.get(cancelled.job.id)?.status).toBe('queued');
    expect(jobs.get(done.id)?.status).toBe('done');
    expect(jobs.get(check.id)?.status).toBe('failed');
    expect(notified).toHaveLength(1);

    // Without a type every type goes; the superseded and blocked ones still stay.
    expect(jobs.retryFailed()).toBe(1);
    expect(jobs.get(check.id)?.status).toBe('queued');
    expect(jobs.retryFailed()).toBe(0);
    expect(notified).toHaveLength(2);
  });
});
