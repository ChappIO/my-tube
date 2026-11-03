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
import { PermanentJobError, PostponeJobError, type JobProgress } from '../jobs/job-runner.js';
import type { LibraryService } from '../library/library.service.js';
import { PlaybackService } from '../library/playback.service.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { SUBTITLE_SPACING_MS } from './backoff.js';
import { SubtitleEmbedder } from './embed.js';
import { SubtitlesRunner } from './subtitles.runner.js';
import { SubtitlesService } from './subtitles.service.js';

const FIXTURES = join(import.meta.dirname, '../../test/fixtures');
const FAKE = join(FIXTURES, 'fake-yt-dlp');
// video.json: "What It Takes", automatic English captions (`en-orig`), Dutch only as a dub.
const VIDEO_ID = '90Kgw_SvK4w';
const FILE = 'NASA/What It Takes (2026-09-04).mp4';

/** A "media file" the fake ffprobe answers with these subtitle streams. */
function probeFile(subtitles: { lang?: string }[]) {
  return JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
      { codec_type: 'audio', codec_name: 'aac' },
      ...subtitles.map((sub) => ({
        codec_type: 'subtitle',
        codec_name: 'mov_text',
        tags: sub.lang ? { language: sub.lang } : {},
      })),
    ],
    format: { duration: '100' },
  });
}

function context(controller = new AbortController()) {
  const reports: JobProgress[] = [];
  return { ctx: { signal: controller.signal, progress: (u: JobProgress) => reports.push(u) } };
}

describe('SubtitlesRunner (fake binaries)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-subtitles-'));
    process.env.FFPROBE_PATH = join(FIXTURES, 'fake-ffprobe');
    process.env.FFMPEG_PATH = join(FIXTURES, 'fake-ffmpeg');
    process.env.FAKE_FFMPEG_ARGS_FILE = join(root, 'ffmpeg.jsonl');
    process.env.FAKE_YTDLP_ARGS_FILE = join(root, 'ytdlp.json');
  });

  afterEach(() => {
    for (const name of [
      'FFPROBE_PATH',
      'FFMPEG_PATH',
      'FAKE_FFMPEG_ARGS_FILE',
      'FAKE_FFMPEG_FAIL',
      'FAKE_YTDLP_ARGS_FILE',
      'FAKE_YTDLP_SUBTITLE_ERROR',
      'FAKE_YTDLP_FAIL',
    ]) {
      delete process.env[name];
    }
    rmSync(root, { recursive: true, force: true });
  });

  function setup(options: { embedded?: { lang?: string }[]; sidecars?: string[] } = {}) {
    const harness = createJobsHarness();
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const logs = new JobLogsService(config);
    const service = new SubtitlesService(harness.db, harness.jobs, harness.settings);
    const playback = new PlaybackService({} as LibraryService, config);
    const runner = new SubtitlesRunner(
      harness.db,
      new YtdlpRunner({ path: () => FAKE }),
      harness.settings,
      config,
      logs,
      harness.jobs,
      playback,
      new SubtitleEmbedder(),
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
        sizeBytes: 1000,
      })
      .returning()
      .get();
    const channel = harness.db
      .insert(channels)
      .values({ youtubeId: 'UCnasa', name: 'NASA', sourceId: source.id })
      .returning()
      .get();
    const file = join(config.videoDir, FILE);
    mkdirSync(join(config.videoDir, 'NASA'), { recursive: true });
    const media = probeFile(options.embedded ?? []);
    writeFileSync(file, media);
    for (const lang of options.sidecars ?? []) {
      writeFileSync(join(config.videoDir, `NASA/What It Takes (2026-09-04).${lang}.vtt`), 'WEBVTT');
    }
    const video = harness.db
      .insert(videos)
      .values({
        channelId: channel.id,
        sourceId: source.id,
        youtubeId: VIDEO_ID,
        title: 'What It Takes',
        publishedAt: '2026-09-04',
        status: 'on_disk',
        filePath: FILE,
        fileSizeBytes: media.length,
      })
      .returning()
      .get();
    service.enqueue(video.id);
    const job = harness.jobs.claimNext(['subtitles'])!;
    const row = () => harness.db.select().from(videos).where(eq(videos.id, video.id)).get()!;
    const sourceRow = () =>
      harness.db.select().from(sources).where(eq(sources.id, source.id)).get()!;
    const ytdlpArgs = () =>
      z.array(z.string()).parse(JSON.parse(readFileSync(join(root, 'ytdlp.json'), 'utf8')));
    const ffmpegRuns = () =>
      readFileSync(join(root, 'ffmpeg.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => z.array(z.string()).parse(JSON.parse(line)));
    return {
      ...harness,
      config,
      logs,
      runner,
      service,
      video,
      job,
      file,
      row,
      sourceRow,
      ytdlpArgs,
      ffmpegRuns,
    };
  }

  it('fetches the missing captions and embeds them, then records the run', async () => {
    const { runner, job, row, sourceRow, file, logs, ytdlpArgs, ffmpegRuns, jobs, settings } =
      setup();
    // Another queued subtitle job, to see the spacing applied.
    const other = jobs.enqueue({ type: 'subtitles', key: 'video:x', payload: { title: 'x' } }).job;
    const outcome = await runner.run(job, context().ctx);
    expect(outcome).toEqual({
      kind: 'video',
      title: 'What It Takes',
      result: 'subtitles',
      details: 'en embedded',
    });
    // The subtitle-only yt-dlp call: Dutch is not asked for (only a dub's transcript).
    const args = ytdlpArgs();
    expect(args).toEqual(expect.arrayContaining(['--skip-download', '--write-subs']));
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('en-orig');
    expect(args[args.indexOf('-o') + 1]).toBe(
      join(settings.get() && root, 'video', 'NASA/What It Takes (2026-09-04).%(ext)s'),
    );
    expect(args).not.toContain('--embed-subs');
    // ffmpeg muxed the renamed sidecar into the file, which then replaced the original.
    const [embed] = ffmpegRuns();
    expect(embed).toEqual(
      expect.arrayContaining(['-i', file, '-i', `${file.slice(0, -4)}.en.vtt`, '-c:s', 'mov_text']),
    );
    expect(embed).toContain('language=eng');
    expect(readFileSync(file, 'utf8')).toMatch(/^WEBVTT/);
    expect(existsSync(`${file.slice(0, -4)}.en.vtt`)).toBe(false);
    // The size follows the file and the source's total moves by the difference.
    const video = row();
    expect(video.fileSizeBytes).toBe(readFileSync(file).length);
    expect(sourceRow().sizeBytes).toBe(1000 + video.fileSizeBytes! - probeFile([]).length);
    expect(video.subtitlesAt).toMatch(/^\d{4}-/);
    expect(video.subtitleLanguages).toBe('en,nl');
    // The next subtitle job waits the spacing.
    const waiting = jobs.get(other.id)!;
    expect(Date.parse(waiting.runAfter!)).toBeGreaterThan(Date.now() + SUBTITLE_SPACING_MS - 5000);
    const log = readFileSync(logs.path(job.id), 'utf8');
    expect(log).toContain(
      "subtitles: no nl (on YouTube only as a dub's transcript or a machine translation)",
    );
    expect(log).toContain('subtitles: fetching en-orig');
    expect(log).toContain(
      'renamed What It Takes (2026-09-04).en-orig.vtt to What It Takes (2026-09-04).en.vtt',
    );
    expect(log).toContain('subtitles: embedded en');
  });

  it('keeps the captions as sidecar files when Settings say so', async () => {
    const { runner, job, file, settings } = setup();
    settings.patch({ video: { subtitlesEmbedded: false } });
    const outcome = await runner.run(job, context().ctx);
    expect(outcome?.details).toBe('en as sidecar files');
    expect(existsSync(`${file.slice(0, -4)}.en.vtt`)).toBe(true);
    expect(existsSync(join(root, 'ffmpeg.jsonl'))).toBe(false);
    expect(readFileSync(file, 'utf8')).toMatch(/^\{/);
  });

  it('fetches nothing the file already has, embedded or as a sidecar', async () => {
    const { runner, job, row, logs } = setup({ embedded: [{ lang: 'eng' }], sidecars: ['nl'] });
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
    expect(existsSync(join(root, 'ytdlp.json'))).toBe(false);
    expect(row().subtitleLanguages).toBe('en,nl');
    const log = readFileSync(logs.path(job.id), 'utf8');
    expect(log).toContain('subtitles: the file has nl, en');
    expect(log).toContain('subtitles: nothing to fetch');
  });

  it('records a video that has none of the wanted subtitles on YouTube', async () => {
    const { runner, job, row, settings } = setup();
    settings.patch({ video: { subtitleLanguages: ['nl'] } });
    await expect(runner.run(job, context().ctx)).resolves.toEqual({
      kind: 'video',
      title: 'What It Takes',
      result: 'no subtitles',
      details: 'no nl subtitles on YouTube',
    });
    expect(row().subtitleLanguages).toBe('nl');
    expect(existsSync(join(root, 'ytdlp.json'))).toBe(true);
    const args = z
      .array(z.string())
      .parse(JSON.parse(readFileSync(join(root, 'ytdlp.json'), 'utf8')));
    expect(args).toContain('--dump-single-json');
    expect(args).not.toContain('--write-subs');
  });

  it('postpones itself and every queued subtitle job on a 429, without counting an attempt', async () => {
    const { runner, job, row, jobs, logs } = setup();
    const other = jobs.enqueue({ type: 'subtitles', key: 'video:x', payload: { title: 'x' } }).job;
    process.env.FAKE_YTDLP_SUBTITLE_ERROR = '1';
    const before = Date.now();
    const error = await runner.run(job, context().ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PostponeJobError);
    const { until, message } = error as PostponeJobError;
    expect(until.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(message).toContain('HTTP Error 429');
    expect(Date.parse(jobs.get(other.id)!.runAfter!)).toBe(until.getTime());
    expect(row().subtitlesAt).toBeNull();
    expect(runner.backoff.count).toBe(1);
    expect(readFileSync(logs.path(job.id), 'utf8')).toContain('rate limited:');
  });

  it('fails for good for a video that is gone from YouTube', async () => {
    const { runner, job, row } = setup();
    process.env.FAKE_YTDLP_FAIL = '1';
    await expect(runner.run(job, context().ctx)).rejects.toBeInstanceOf(PermanentJobError);
    expect(row().subtitlesAt).not.toBeNull();
  });

  it('does nothing for a video that is not on disk or whose file is gone', async () => {
    const { runner, job, db, video, file } = setup();
    rmSync(file);
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
    db.update(videos).set({ status: 'missing' }).where(eq(videos.id, video.id)).run();
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
  });

  it('records the run and fetches nothing without languages in Settings', async () => {
    const { runner, job, row, settings } = setup();
    settings.patch({ video: { subtitleLanguages: [] } });
    await expect(runner.run(job, context().ctx)).resolves.toBeNull();
    expect(row()).toMatchObject({ subtitleLanguages: '' });
    expect(row().subtitlesAt).not.toBeNull();
  });
});

describe('SubtitlesService', () => {
  it('queues the videos on disk whose last run was not with the current languages', () => {
    const harness = createJobsHarness();
    const service = new SubtitlesService(harness.db, harness.jobs, harness.settings);
    const channel = harness.db
      .insert(channels)
      .values({ youtubeId: 'UCx', name: 'X' })
      .returning()
      .get();
    const add = (youtubeId: string, extra: Partial<typeof videos.$inferInsert>) =>
      harness.db
        .insert(videos)
        .values({ channelId: channel.id, youtubeId, title: youtubeId, ...extra })
        .returning()
        .get();
    add('never', { status: 'on_disk', filePath: 'a.mp4', publishedAt: '2026-01-01' });
    add('old-languages', {
      status: 'on_disk',
      filePath: 'b.mp4',
      subtitlesAt: '2026-10-01T00:00:00.000Z',
      subtitleLanguages: 'en',
      publishedAt: '2026-03-01',
    });
    add('current', {
      status: 'on_disk',
      filePath: 'c.mp4',
      subtitlesAt: '2026-10-01T00:00:00.000Z',
      subtitleLanguages: 'en,nl',
    });
    add('wanted', { status: 'wanted' });
    expect(service.status()).toEqual({ missing: 2, queued: 0, pausedUntil: null });
    expect(service.enqueueMissing()).toBe(2);
    expect(service.enqueueMissing()).toBe(0);
    expect(service.status()).toEqual({ missing: 2, queued: 2, pausedUntil: null });
    // Newest first, like downloads.
    expect(harness.jobs.listQueue().map((job) => job.title)).toEqual(['old-languages', 'never']);
    expect(harness.jobs.listQueue()[0]).toMatchObject({
      type: 'subtitles',
      subtitle: 'X',
      detail: 'subtitles',
    });
    // A pause shows once the queued jobs wait well into the future.
    const until = new Date(Date.now() + 3_600_000);
    harness.jobs.delayQueued('subtitles', until);
    expect(service.status().pausedUntil).toBe(until.toISOString());
    // No languages: nothing is missing and nothing is queued.
    harness.settings.patch({ video: { subtitleLanguages: [] } });
    expect(service.status().missing).toBe(0);
    expect(service.enqueueMissing()).toBe(0);
  });
});
