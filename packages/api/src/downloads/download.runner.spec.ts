import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SOURCE_OPTIONS, DEFAULT_VIDEO_MATCHER } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import { channels, sources, videos } from '../database/schema.js';
import { JobLogsService } from '../jobs/job-logs.service.js';
import { PermanentJobError, type JobProgress, type JobRow } from '../jobs/job-runner.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { DownloadRunner, insideLibrary } from './download.runner.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
// The fake serves video.json for watch URLs: "What It Takes", uploaded 2026-09-04 (approximate
// date in the listing: 2026-09-10).
const VIDEO_ID = '90Kgw_SvK4w';

function context(controller = new AbortController()) {
  const reports: JobProgress[] = [];
  return {
    reports,
    controller,
    ctx: { signal: controller.signal, progress: (update: JobProgress) => reports.push(update) },
  };
}

describe('DownloadRunner (fake binary)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-download-'));
  });

  afterEach(() => {
    for (const name of [
      'FAKE_YTDLP_FAIL',
      'FAKE_YTDLP_DELAY_MS',
      'FAKE_YTDLP_STDOUT',
      'FAKE_YTDLP_STREAMS',
    ]) {
      delete process.env[name];
    }
    delete process.env.FAKE_YTDLP_ARGS_FILE;
    rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    const harness = createJobsHarness();
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const logs = new JobLogsService(config);
    const runner = new DownloadRunner(
      harness.db,
      new YtdlpRunner({ path: () => FAKE }),
      harness.settings,
      config,
      logs,
    );
    const source = harness.db
      .insert(sources)
      .values({
        library: 'video',
        kind: 'channel',
        youtubeId: 'UCnasa',
        url: 'https://www.youtube.com/channel/UCnasa',
        name: 'NASA',
        matcher: DEFAULT_VIDEO_MATCHER,
        options: DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    const channel = harness.db
      .insert(channels)
      .values({ youtubeId: 'UCnasa', name: 'NASA', sourceId: source.id })
      .returning()
      .get();
    const video = harness.db
      .insert(videos)
      .values({
        channelId: channel.id,
        sourceId: source.id,
        youtubeId: VIDEO_ID,
        title: 'What It Takes',
        publishedAt: '2026-09-10',
      })
      .returning()
      .get();
    const job = harness.jobs.enqueue({
      type: 'download',
      key: `video:${VIDEO_ID}`,
      payload: { title: video.title, subtitle: 'NASA', historyKind: 'video', videoId: video.id },
    }).job;
    const row = () => harness.db.select().from(videos).where(eq(videos.id, video.id)).get()!;
    return { ...harness, config, logs, runner, source, video, job, row };
  }

  it('downloads to the templated path and marks the video on disk', async () => {
    const { runner, job, row, db, source, logs, config } = setup();
    const argsFile = join(root, 'args.json');
    process.env.FAKE_YTDLP_ARGS_FILE = argsFile;
    process.env.FAKE_YTDLP_STREAMS = 'split';
    const { ctx, reports } = context();

    const outcome = await runner.run(job, ctx);

    // The exact date from the video's own metadata replaces the listing's approximate one.
    const path = 'NASA/What It Takes (2026-09-04).mp4';
    expect(outcome).toEqual({
      title: 'What It Takes',
      result: 'done',
      kind: 'video',
      details: path,
    });
    expect(readFileSync(join(config.videoDir, path), 'utf8')).toBe('fake media');
    expect(row()).toMatchObject({
      status: 'on_disk',
      filePath: path,
      fileSizeBytes: 10,
      publishedAt: '2026-09-04',
    });
    expect(row().downloadedAt).not.toBeNull();
    expect(db.select().from(sources).where(eq(sources.id, source.id)).get()?.sizeBytes).toBe(10);

    // The size the metadata call resolved (video + audio in video.json) is known up front.
    expect(reports[0]).toEqual({ totalBytes: 3_000_000 });
    // Progress is one monotonic bar: up to 0.9 over both streams (the subtitle track does not
    // count), then a step per post-processor, which is also the stage.
    const fractions = reports.flatMap((r) => (r.progress == null ? [] : [r.progress]));
    expect(fractions.toSorted((a, b) => a - b)).toEqual(fractions);
    const downloading = reports.filter((r) => r.progress != null && r.stage === null);
    expect(downloading.length).toBeGreaterThan(8);
    expect(downloading.every((r) => r.progress! <= 0.9 && r.totalBytes === 3_000_000)).toBe(true);
    // The video stream (2.4 of 3 MB) ends at 0.72, not at the cap.
    expect(downloading.some((r) => Math.abs(r.progress! - 0.72) < 1e-9)).toBe(true);
    expect(Math.max(...fractions)).toBeCloseTo(0.944, 9);
    const stages = reports.flatMap((r) => (r.stage ? [[r.stage, r.progress ?? null]] : []));
    expect(stages).toEqual([
      ['ThumbnailsConvertor', null],
      ['ThumbnailsConvertor', null],
      ['Merger', 0.911],
      ['Merger', 0.911],
      ['VideoRemuxer', 0.922],
      ['VideoRemuxer', 0.922],
      ['EmbedSubtitle', expect.closeTo(0.933, 9)],
      ['EmbedSubtitle', expect.closeTo(0.933, 9)],
      ['MoveFiles', expect.closeTo(0.944, 9)],
      ['MoveFiles', expect.closeTo(0.944, 9)],
    ]);
    expect(reports.filter((r) => r.stage).every((r) => r.speedBytesPerSec === null)).toBe(true);

    // Format, container, subtitles and thumbnails come from Settings → Video.
    const args = z.array(z.string()).parse(JSON.parse(readFileSync(argsFile, 'utf8')));
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(after('-f')).toBe('bestvideo[height<=1080]+bestaudio/best[height<=1080]');
    expect(after('--merge-output-format')).toBe('mkv');
    expect(after('--remux-video')).toBe('mkv');
    expect(after('--sub-langs')).toBe('en,nl');
    expect(args).toEqual(expect.arrayContaining(['--embed-subs', '--write-thumbnail']));
    expect(args).not.toContain('--write-subs');
    expect(after('--convert-thumbnails')).toBe('jpg');
    expect(after('-o')).toBe(join(config.videoDir, 'NASA/What It Takes (2026-09-04).%(ext)s'));

    // The job log has both yt-dlp runs, command lines first.
    const log = readFileSync(logs.path(job.id), 'utf8');
    expect(log).toMatch(/^=== download job 1 · attempt 1 of 3 /);
    expect(log.match(/^\$ /gm)).toHaveLength(2);
    // The metadata call resolves the same format selector as the download.
    expect(log).toMatch(
      /^\$ .* --dump-single-json .* -f bestvideo\[height<=1080\]\+bestaudio\/best\[height<=1080\] -- /m,
    );
    expect(log).toContain('[mytube-progress]');
    expect(log).toContain(`saved ${path} (10 bytes)`);
  });

  it('marks a removed video unavailable and fails for good', async () => {
    const { runner, job, row } = setup();
    process.env.FAKE_YTDLP_FAIL = '1';
    const error = await runner.run(job, context().ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(String(error)).toMatch(/Video unavailable/);
    expect(row()).toMatchObject({ status: 'skipped', skipReason: 'unavailable' });
  });

  it('puts the video back to wanted on a retryable failure', async () => {
    const { runner, job, row, logs } = setup();
    process.env.FAKE_YTDLP_STDOUT = 'not json';
    const error = await runner.run(job, context().ctx).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PermanentJobError);
    expect(row().status).toBe('wanted');
    expect(readFileSync(logs.path(job.id), 'utf8')).toMatch(/failed: yt-dlp printed invalid JSON/);
  });

  it('cancels: kills yt-dlp, removes partial files and keeps the video wanted', async () => {
    const { runner, job, row, config } = setup();
    const folder = join(config.videoDir, 'NASA');
    mkdirSync(folder, { recursive: true });
    const partial = join(folder, 'What It Takes (2026-09-04).f137.mp4.part');
    const thumb = join(folder, 'What It Takes (2026-09-04).jpg');
    const other = join(folder, 'Another video (2026-09-01).mkv');
    writeFileSync(partial, 'x');
    writeFileSync(thumb, 'x');
    writeFileSync(other, 'x');
    process.env.FAKE_YTDLP_DELAY_MS = '200';
    const { ctx, controller, reports } = context();

    const running = runner.run(job, ctx).catch((e: unknown) => e);
    await waitFor(() => reports.length > 0);
    controller.abort('cancel');
    await running;

    expect(row().status).toBe('wanted');
    expect(existsSync(partial)).toBe(false);
    expect(existsSync(thumb)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it('does nothing for a video already on disk or skipped by the rules', async () => {
    const { runner, job, db, video } = setup();
    db.update(videos).set({ status: 'on_disk' }).where(eq(videos.id, video.id)).run();
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
    db.update(videos)
      .set({ status: 'skipped', skipReason: 'no_match' })
      .where(eq(videos.id, video.id))
      .run();
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
  });

  it('fails for good when the video row is gone', async () => {
    const { runner, job } = setup();
    const orphan: JobRow = { ...job, payload: { ...job.payload, videoId: 999 } };
    await expect(runner.run(orphan, context().ctx)).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('insideLibrary', () => {
  it('joins inside the root and refuses to escape it', () => {
    expect(insideLibrary('/media/video', 'NASA/a')).toBe('/media/video/NASA/a');
    expect(() => insideLibrary('/media/video', '../etc/passwd')).toThrow(PermanentJobError);
    expect(() => insideLibrary('/media/video', '/etc/passwd')).toThrow(PermanentJobError);
    expect(() => insideLibrary('/media/video', '')).toThrow(PermanentJobError);
  });
});

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
