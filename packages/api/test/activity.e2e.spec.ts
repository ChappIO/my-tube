import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActivitySummary, HistoryEntry, Job, RulesPreview, Source, and, not } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { JOB_RUNNERS } from '../src/jobs/job-runner.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { CheckSourceRunner } from '../src/sync/check-source.runner.js';
import { DownloadDispatchRunner } from '../src/downloads/download-dispatch.runner.js';
import { RevalidateRunner } from '../src/sync/revalidate.runner.js';

/*
 * The sync → download → Activity loop against the fake yt-dlp: adding a source checks it at
 * once, the check enqueues the videos the rules accept, the fake "downloads" them into
 * VIDEO_DIR, and the Activity endpoints show the queue, the history and the log.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));
/** The listing's title; later checks refresh the title the download stored. */
const MOON_BASE = 'NASA Moon Base: The First Six Months';

describe('Activity (e2e)', () => {
  let app: INestApplication;
  let root: string;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-activity-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = join(root, 'video');
    process.env.MUSIC_DIR = join(root, 'music');
    process.env.YTDLP_PATH = FAKE_YTDLP;
    // Without the maintenance runners, so a `rescan` job stays where the test puts it.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JOB_RUNNERS)
      .useFactory({
        factory: (...runners: unknown[]) => runners,
        inject: [CheckSourceRunner, RevalidateRunner, DownloadDispatchRunner],
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const name of ['CONFIG_DIR', 'VIDEO_DIR', 'MUSIC_DIR', 'YTDLP_PATH']) {
      delete process.env[name];
    }
    rmSync(root, { recursive: true, force: true });
  });

  const history = async () =>
    z.array(HistoryEntry).parse((await request(server()).get('/api/activity/history')).body);

  let source: Source;

  it('adding a source checks it and downloads what the rules accept', async () => {
    const created = await request(server())
      .post('/api/sources')
      .send({
        url: 'https://www.youtube.com/@NASA',
        library: 'video',
        matcher: and({ type: 'title_contains', text: 'Six Months' }),
      })
      .expect(201);
    source = Source.parse(created.body);

    const done = await waitFor(async () => (await history()).find((e) => e.result === 'done'));
    expect(done).toMatchObject({ kind: 'video', jobId: expect.any(Number) });
    // The fake answers every watch URL with the "What It Takes" fixture (2026-09-04).
    expect(done.details).toBe('NASA/What It Takes (2026-09-04).mp4');
    expect(existsSync(join(root, 'video', done.details!))).toBe(true);

    // The routine check itself left no history row, only its log.
    expect((await history()).map((entry) => entry.result)).toEqual(['done']);

    const log = await request(server()).get(`/api/jobs/${done.jobId}/log`).expect(200);
    expect(log.headers['content-type']).toMatch(/^text\/plain/);
    expect(log.headers['content-disposition']).toBe(`inline; filename="job-${done.jobId}.log"`);
    expect(log.text).toMatch(/^=== download job \d+ · attempt 1 of 3/);
    expect(log.text).toMatch(/^\d\d:\d\d:\d\d\.\d{3} \$ /m);

    const download = await request(server())
      .get(`/api/jobs/${done.jobId}/log?download=1`)
      .expect(200);
    expect(download.headers['content-disposition']).toBe(
      `attachment; filename="job-${done.jobId}.log"`,
    );
    expect(download.text).toBe(log.text);

    const job = Job.parse(
      (await request(server()).get(`/api/jobs/${done.jobId}`).expect(200)).body,
    );
    expect(job).toMatchObject({ id: done.jobId, type: 'download', status: 'done', attempts: 0 });
    expect(job.finishedAt).not.toBeNull();

    const checked = Source.parse(
      (await request(server()).get(`/api/sources/${source.id}`).expect(200)).body,
    );
    expect(checked.lastCheckedAt).not.toBeNull();
    expect(checked.itemCount).toBe(1);
    expect(checked.sizeBytes).toBe(10);
  });

  it('GET /api/activity/queue, /summary and /history answer the shared schemas', async () => {
    const jobs = app.get(JobsService);
    // No runner handles `rescan` in this app (see beforeAll), so this job stays queued.
    const { job } = jobs.enqueue({ type: 'rescan', payload: { title: 'Rescan libraries' } });

    const queue = z.array(Job).parse((await request(server()).get('/api/activity/queue')).body);
    expect(queue.map((row) => row.id)).toEqual([job.id]);
    expect(queue[0]).toMatchObject({ status: 'queued', progress: null, stage: null });

    // A running job's post-processing stage reaches the queue, and a cancel clears it.
    jobs.claimNext(['rescan']);
    jobs.updateProgress(job.id, { progress: 0.911, stage: 'Merger', speedBytesPerSec: null });
    const running = z.array(Job).parse((await request(server()).get('/api/activity/queue')).body);
    expect(running[0]).toMatchObject({ status: 'running', progress: 0.911, stage: 'Merger' });
    jobs.cancel(job.id);
    expect(jobs.get(job.id)).toMatchObject({ status: 'cancelled', stage: null });
    await request(server()).post(`/api/jobs/${job.id}/retry`).expect(200);
    const summary = ActivitySummary.parse(
      (await request(server()).get('/api/activity/summary').expect(200)).body,
    );
    expect(summary).toEqual({ activeDownloads: 0, queued: 1 });

    await request(server()).get('/api/activity/history?limit=1').expect(200);
    await request(server()).get('/api/activity/history?limit=0').expect(400);

    // Cancel, retry, and the error answers.
    await request(server()).post(`/api/jobs/${job.id}/cancel`).expect(204);
    expect((await request(server()).get('/api/activity/queue')).body).toEqual([]);
    await request(server()).post(`/api/jobs/${job.id}/retry`).expect(200);
    await request(server()).post(`/api/jobs/${job.id}/retry`).expect(409);
    await request(server()).post(`/api/jobs/${job.id}/cancel`).expect(204);
    await request(server()).post('/api/jobs/9999/cancel').expect(404);
    await request(server()).post('/api/jobs/9999/retry').expect(404);
    await request(server()).get('/api/jobs/9999/log').expect(404);
    await request(server()).get('/api/jobs/9999').expect(404);
    await request(server()).get('/api/jobs/nope').expect(400);
  });

  it('POST /api/sources/:id/check and /api/sync/check-all enqueue checks', async () => {
    const one = await request(server()).post(`/api/sources/${source.id}/check`).expect(202);
    expect(Job.parse(one.body)).toMatchObject({ type: 'check_source', title: 'NASA' });
    await request(server()).post('/api/sources/9999/check').expect(404);

    const all = z
      .array(Job)
      .parse((await request(server()).post('/api/sync/check-all').expect(202)).body);
    expect(all.map((job) => job.type)).toEqual(['check_source']);

    // The second check finds nothing new to download.
    await waitFor(async () => {
      const queue = z.array(Job).parse((await request(server()).get('/api/activity/queue')).body);
      return queue.length === 0 ? true : undefined;
    });
    expect((await history()).filter((entry) => entry.result === 'done')).toHaveLength(1);
  });

  it('tightened rules preview the removal, then revalidation removes the file', async () => {
    const file = join(root, 'video', 'NASA/What It Takes (2026-09-04).mp4');
    const thumbnail = join(root, 'video', 'NASA/What It Takes (2026-09-04).jpg');
    const subtitles = join(root, 'video', 'NASA/What It Takes (2026-09-04).en.vtt');
    writeFileSync(thumbnail, 'jpg');
    writeFileSync(subtitles, 'vtt');
    // Rules that still match keep the file.
    const keep = RulesPreview.parse(
      (
        await request(server())
          .post(`/api/sources/${source.id}/rules/preview`)
          .send({ matcher: and(not({ type: 'is_short' })) })
          .expect(200)
      ).body,
    );
    expect(keep).toEqual({ wouldRemove: [], wouldKeep: 1 });

    const tightened = and({ type: 'title_contains', text: 'Zebra' });
    const preview = RulesPreview.parse(
      (
        await request(server())
          .post(`/api/sources/${source.id}/rules/preview`)
          .send({ matcher: tightened })
          .expect(200)
      ).body,
    );
    expect(preview).toEqual({
      wouldRemove: [{ id: expect.any(Number), title: MOON_BASE, failing: ['only "Zebra"'] }],
      wouldKeep: 0,
    });
    expect(existsSync(file)).toBe(true);

    // Saving the rules queues a revalidation at once.
    await request(server())
      .patch(`/api/sources/${source.id}`)
      .send({ matcher: tightened })
      .expect(200);
    const removed = await waitFor(async () =>
      (await history()).find((entry) => entry.result === 'removed'),
    );
    expect(removed).toMatchObject({
      kind: 'video',
      title: MOON_BASE,
      details: 'no longer matches: only "Zebra"',
      jobId: expect.any(Number),
    });
    expect(existsSync(file)).toBe(false);
    expect(existsSync(thumbnail)).toBe(false);
    expect(existsSync(subtitles)).toBe(false);
    // The channel folder was left empty and is gone; the library root stays.
    expect(readdirSync(join(root, 'video'))).toEqual([]);
    const log = await request(server()).get(`/api/jobs/${removed.jobId}/log`).expect(200);
    expect(log.text).toMatch(/^=== revalidate job \d+/);
    expect(log.text).toContain('removed NASA/What It Takes (2026-09-04).mp4');

    const after = Source.parse(
      (await request(server()).get(`/api/sources/${source.id}`).expect(200)).body,
    );
    expect(after).toMatchObject({ sizeBytes: 0, itemCount: 0 });
    // Nothing is left to remove.
    const again = RulesPreview.parse(
      (
        await request(server())
          .post(`/api/sources/${source.id}/rules/preview`)
          .send({ matcher: tightened })
          .expect(200)
      ).body,
    );
    expect(again).toEqual({ wouldRemove: [], wouldKeep: 0 });
  });
});

async function waitFor<T>(probe: () => Promise<T | undefined>, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
