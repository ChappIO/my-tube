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
});
