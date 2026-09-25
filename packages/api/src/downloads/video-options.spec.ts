import { DEFAULT_SETTINGS } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import type { ExpectedStream } from '../ytdlp/metadata.js';
import type { DownloadProgress } from '../ytdlp/progress.js';
import { buildArgs } from '../ytdlp/args.js';
import {
  DownloadProgressTracker,
  isUnavailableReason,
  subtitleLanguages,
  videoExtraArgs,
  videoFormat,
} from './video-options.js';

describe('videoFormat', () => {
  it('caps the height and falls back to the best single file', () => {
    expect(videoFormat('1080p', 'mkv')).toBe(
      'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    );
    expect(videoFormat('480p', 'mkv')).toBe('bestvideo[height<=480]+bestaudio/best[height<=480]');
    expect(videoFormat('best', 'mkv')).toBe('bestvideo+bestaudio/best');
  });

  it('prefers streams that fit mp4 and webm without re-encoding', () => {
    expect(videoFormat('720p', 'mp4')).toBe(
      'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
    );
    expect(videoFormat('best', 'webm')).toBe(
      'bestvideo[ext=webm]+bestaudio[ext=webm]/bestvideo+bestaudio/best',
    );
  });
});

describe('videoExtraArgs', () => {
  const video = DEFAULT_SETTINGS.video;

  it('maps the defaults: remux, embedded en/nl subtitles with generated ones, jpg thumbnail', () => {
    expect(videoExtraArgs(video)).toEqual([
      '--remux-video',
      'mp4',
      '--embed-subs',
      '--write-auto-subs',
      '--extractor-args',
      'youtube:skip=translated_subs',
      '--sub-langs',
      'en,nl',
      '--write-thumbnail',
      '--convert-thumbnails',
      'jpg',
    ]);
  });

  it('keeps subtitles as sidecars, drops them without languages and skips thumbnails', () => {
    expect(videoExtraArgs({ ...video, subtitlesEmbedded: false, saveThumbnails: false })).toEqual([
      '--remux-video',
      'mp4',
      '--write-subs',
      '--write-auto-subs',
      '--extractor-args',
      'youtube:skip=translated_subs',
      '--sub-langs',
      'en,nl',
    ]);
    expect(
      videoExtraArgs({ ...video, container: 'webm', subtitleLanguages: [], saveThumbnails: false }),
    ).toEqual([]);
  });

  it('leaves generated subtitles out when they are off, embedded or as sidecars', () => {
    const off = { ...video, autoSubtitles: false, saveThumbnails: false };
    expect(videoExtraArgs(off)).toEqual([
      '--remux-video',
      'mp4',
      '--embed-subs',
      '--sub-langs',
      'en,nl',
    ]);
    expect(
      videoExtraArgs({ ...off, subtitlesEmbedded: false, subtitleLanguages: ['pt-BR'] }),
    ).toEqual(['--remux-video', 'mp4', '--write-subs', '--sub-langs', 'pt-BR']);
  });

  it('asks for no subtitles at all without languages, even with generated ones on', () => {
    const args = videoExtraArgs({ ...video, subtitleLanguages: [], autoSubtitles: true });
    expect(args).not.toContain('--write-auto-subs');
    expect(args).not.toContain('--sub-langs');
    expect(args).not.toContain('--embed-subs');
    expect(args).not.toContain('--extractor-args');
  });

  it('asks only for languages the video has, leaving machine translations out', () => {
    const captions = { uploaded: ['de'], generated: ['en-orig', 'en'] };
    const video4 = { ...video, subtitleLanguages: ['en', 'nl', 'de'] };
    expect(subtitleLanguages(video4, captions)).toEqual({
      languages: ['en', 'de'],
      skipped: ['nl'],
    });
    const args = videoExtraArgs(video4, captions);
    expect(args[args.indexOf('--sub-langs') + 1]).toBe('en,de');
    // Nothing left: no subtitle flags at all.
    const none = videoExtraArgs({ ...video4, subtitleLanguages: ['nl'] }, captions);
    expect(none).not.toContain('--sub-langs');
    expect(none).not.toContain('--write-auto-subs');
    // Unknown captions, or generated subtitles off (no translations are asked for): as set.
    expect(subtitleLanguages(video4, null).languages).toEqual(['en', 'nl', 'de']);
    expect(subtitleLanguages({ ...video4, autoSubtitles: false }, captions).languages).toEqual([
      'en',
      'nl',
      'de',
    ]);
  });

  it('passes the skip as its own --extractor-args pair through the download call', () => {
    const args = buildArgs({
      kind: 'download',
      url: 'https://www.youtube.com/watch?v=abc',
      output: '/media/video/x.%(ext)s',
      extraArgs: videoExtraArgs(video),
    });
    const at = args.indexOf('--extractor-args');
    expect(args[at + 1]).toBe('youtube:skip=translated_subs');
    expect(args.filter((arg) => arg === '--extractor-args')).toHaveLength(1);
    // A metadata call keeps its own, for another extractor; yt-dlp takes one flag per extractor.
    const metadata = buildArgs({ kind: 'metadata', url: 'https://www.youtube.com/@x' });
    expect(metadata[metadata.indexOf('--extractor-args') + 1]).toBe('youtubetab:approximate_date');
  });
});

describe('isUnavailableReason', () => {
  it('recognises videos that are gone for good', () => {
    for (const reason of [
      '[youtube] abc: Video unavailable',
      '[youtube] abc: Private video. Sign in if you have been granted access',
      '[youtube] abc: This video has been removed by the uploader',
      '[youtube] abc: Join this channel to get access to members-only content',
      '[youtube] abc: This video is no longer available due to a copyright claim',
    ]) {
      expect(isUnavailableReason(reason)).toBe(true);
    }
  });

  it("recognises yt-dlp's members-only message", () => {
    const reason =
      "ERROR: [youtube] Ar6PspVnJxc: This video is available to this channel's members on level: " +
      'So Good (or any higher level). Join this channel to get access to members-only content ' +
      'and other exclusive perks.';
    expect(isUnavailableReason(reason)).toBe(true);
    // Each phrase on its own is enough, should YouTube reword the rest.
    expect(
      isUnavailableReason("[youtube] abc: available to this channel's members on level: 1"),
    ).toBe(true);
    expect(isUnavailableReason('[youtube] abc: members-only content')).toBe(true);
  });

  it('leaves bot checks, network errors and missing reasons retryable', () => {
    expect(isUnavailableReason("[youtube] abc: Sign in to confirm you're not a bot")).toBe(false);
    expect(isUnavailableReason('Unable to download webpage: HTTP Error 503')).toBe(false);
    expect(isUnavailableReason(null)).toBe(false);
  });
});

function downloading(
  downloadedBytes: number,
  totalBytes: number | null,
  percent: number | null = null,
): DownloadProgress {
  return {
    status: 'downloading',
    percent,
    downloadedBytes,
    totalBytes,
    speedBytesPerSec: 1000,
    etaSeconds: 5,
  };
}

const finished = (bytes: number): DownloadProgress => ({
  ...downloading(bytes, bytes, 100),
  status: 'finished',
});

const postprocessor = (name: string): DownloadProgress => ({
  ...downloading(0, null),
  status: 'postprocessing',
  postprocessor: name,
});

const oneStream = (bytes: number | null): ExpectedStream[] => [{ formatId: null, bytes }];
const twoStreams = (video: number | null, audio: number | null): ExpectedStream[] => [
  { formatId: null, bytes: video },
  { formatId: null, bytes: audio },
];

const MB = 1_000_000;
const VIDEO = 400 * MB;
const AUDIO = 40 * MB;

/**
 * The reported case: a large video stream that finishes, then the audio stream, whose size
 * yt-dlp only learns when it starts. Returns the bar after each video and each audio line.
 */
function longVideo(tracker: DownloadProgressTracker) {
  const bar = (progress: DownloadProgress) => tracker.update(progress)?.progress ?? null;
  const video: (number | null)[] = [];
  for (let bytes = 0; bytes <= VIDEO; bytes += 40 * MB) video.push(bar(downloading(bytes, VIDEO)));
  video.push(bar(finished(VIDEO)));
  const audio: (number | null)[] = [];
  for (let bytes = 0; bytes <= AUDIO; bytes += 4 * MB) audio.push(bar(downloading(bytes, AUDIO)));
  const end = bar(finished(AUDIO));
  return { video, audio, end };
}

function increasing(values: (number | null)[]): boolean {
  return values.every((value, i) => i === 0 || (value ?? 0) > (values[i - 1] ?? 0));
}

describe('DownloadProgressTracker', () => {
  it('with the expected size known, runs smoothly through the audio and holds 0.9 back', () => {
    const tracker = new DownloadProgressTracker(twoStreams(VIDEO, AUDIO));
    expect(tracker.start()).toEqual({ totalBytes: VIDEO + AUDIO });
    const { video, audio, end } = longVideo(tracker);

    // The video stream is 400 of 440 MB: its end is 0.9 × 400/440, not 0.9 (or 0.99).
    expect(video.at(-1)).toBeCloseTo((0.9 * VIDEO) / (VIDEO + AUDIO), 6);
    // The audio phase climbs on every line and stays below 0.9 until its last byte is in.
    expect(increasing(audio.slice(1))).toBe(true);
    expect(audio.slice(0, -1).every((value) => value !== null && value < 0.9)).toBe(true);
    expect(audio.at(-2)).toBeGreaterThan(0.89);
    expect(audio.at(-1)).toBeCloseTo(0.9, 9);
    expect(end).toBeCloseTo(0.9, 9);
    // Never backwards over the whole download.
    const all = [...video, ...audio, end];
    expect(all.toSorted((a, b) => (a ?? 0) - (b ?? 0))).toEqual(all);
  });

  it('with the size unknown, still moves while the audio arrives', () => {
    const tracker = new DownloadProgressTracker([]);
    expect(tracker.start()).toEqual({});
    const { video, audio, end } = longVideo(tracker);

    // The video alone looks like the whole download...
    expect(video.at(-1)).toBeCloseTo(0.9, 9);
    // ...until the audio reveals its size: the bar steps back once, then climbs on every line
    // (no plateau at the cap while bytes arrive), never past 0.9.
    expect(audio[0]).toBeLessThan(0.9);
    expect(increasing(audio)).toBe(true);
    expect(audio.every((value) => value !== null && value <= 0.9)).toBe(true);
    expect(end).toBeCloseTo(0.9, 9);
  });

  it('with only the audio size unknown, behaves as unknown: no plateau in the audio', () => {
    const tracker = new DownloadProgressTracker(twoStreams(VIDEO, null));
    expect(tracker.start()).toEqual({});
    const { audio } = longVideo(tracker);
    expect(audio[0]).toBeLessThan(0.9);
    expect(increasing(audio)).toBe(true);
  });

  it('follows fragments, not the first fragment’s estimate, for an HLS stream', () => {
    // Format 616 (HLS) has no size, only a bitrate: the plan says 517 MB, it turns out 386 MB.
    const tracker = new DownloadProgressTracker([
      { formatId: '616', bytes: 517 * MB },
      { formatId: '140', bytes: 19 * MB },
    ]);
    expect(tracker.start()).toEqual({ totalBytes: 536 * MB });
    const fragment = (index: number, downloaded: number, estimate: number): DownloadProgress => ({
      ...downloading(downloaded, estimate, (index / 216) * 100),
      formatId: '616',
      estimated: true,
    });
    // The init segment: 712 of an "estimated" 712 bytes. Not 90 %.
    expect(tracker.update(fragment(0, 712, 712))).toMatchObject({
      progress: 0,
      totalBytes: 536 * MB,
    });
    const half = tracker.update(fragment(108, 190 * MB, 380 * MB));
    expect(half?.progress).toBeCloseTo((0.9 * 0.5 * 517) / 536, 6);
    // Past a tenth of the stream the meta line trusts yt-dlp's estimate.
    expect(half?.totalBytes).toBe(399 * MB);
    const video = tracker.update(fragment(215, 385 * MB, 386 * MB))?.progress ?? 0;
    // The real size replaces the plan: the bar holds, then the audio moves it on to 0.9.
    expect(tracker.update({ ...finished(386 * MB), formatId: '616' })?.progress).toBe(video);
    const audio = [5, 10, 15, 19].map(
      (mb) => tracker.update({ ...downloading(mb * MB, 19 * MB), formatId: '140' })?.progress ?? 0,
    );
    expect(audio.at(-2)).toBeGreaterThan(video);
    expect(audio.at(-1)).toBeCloseTo(0.9, 9);
    expect(audio.toSorted((a, b) => a - b)).toEqual(audio);
  });

  it('reports the growing total and nulls speed and eta between streams', () => {
    const tracker = new DownloadProgressTracker([]);
    expect(tracker.update(downloading(450, 900))).toMatchObject({
      progress: 0.45,
      totalBytes: 900,
      speedBytesPerSec: 1000,
      stage: null,
    });
    expect(tracker.update(finished(900))).toMatchObject({
      totalBytes: 900,
      speedBytesPerSec: null,
      etaSeconds: null,
    });
    expect(tracker.update(downloading(10, 100))).toMatchObject({ totalBytes: 1000 });
  });

  it('grows a known total when yt-dlp reports more than expected', () => {
    const tracker = new DownloadProgressTracker(oneStream(1000));
    expect(tracker.update(downloading(600, 1200))).toMatchObject({
      progress: 0.45,
      totalBytes: 1200,
    });
    expect(tracker.update(downloading(1200, 1200))?.progress).toBeCloseTo(0.9, 9);
  });

  it('uses the percentage when sizes are unknown', () => {
    const tracker = new DownloadProgressTracker();
    const report = tracker.update(downloading(0, null, 25));
    expect(report).toMatchObject({ progress: 0.225, totalBytes: null });
  });

  it('leaves subtitle tracks out of the bar', () => {
    const tracker = new DownloadProgressTracker(oneStream(1000));
    expect(tracker.update({ ...finished(1642), formatId: null })).toBeNull();
    expect(tracker.update({ ...downloading(500, 1000), formatId: '18' })?.progress).toBe(0.45);
  });

  it('moves through 0.9 to 0.99 once per distinct post-processor, with the stage', () => {
    const tracker = new DownloadProgressTracker(oneStream(1000));
    // Before any stream: the thumbnail conversion shows as the stage, the bar stays.
    expect(tracker.update(postprocessor('ThumbnailsConvertor'))).toEqual({
      speedBytesPerSec: null,
      etaSeconds: null,
      stage: 'ThumbnailsConvertor',
    });
    expect(tracker.update(finished(1000))).toMatchObject({ progress: 0.9, stage: null });

    const step = (name: string) => tracker.update(postprocessor(name));
    expect(step('Merger')).toEqual({
      progress: 0.911,
      speedBytesPerSec: null,
      etaSeconds: null,
      stage: 'Merger',
    });
    // `started` and `finished` of one post-processor are one step.
    expect(step('Merger')?.progress).toBe(0.911);
    expect(step('VideoRemuxer')).toMatchObject({ progress: 0.922, stage: 'VideoRemuxer' });
    expect(step('EmbedSubtitle')?.progress).toBeCloseTo(0.933, 9);
    expect(step('MoveFiles')?.progress).toBeCloseTo(0.944, 9);

    // However many run, the bar stays below 0.99; the jobs service writes 1 on completion.
    const bars = Array.from({ length: 20 }, (_, i) => step(`Extra${i}`)?.progress ?? 0);
    expect(bars.toSorted((a, b) => a - b)).toEqual(bars);
    expect(Math.max(...bars)).toBeLessThan(0.99);
    expect(Math.max(...bars)).toBeCloseTo(0.988, 9);
  });
});
