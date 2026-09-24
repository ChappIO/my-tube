import { DEFAULT_SETTINGS } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import type { DownloadProgress } from '../ytdlp/progress.js';
import {
  DownloadProgressTracker,
  isUnavailableReason,
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

  it('maps the defaults: remux, embedded en/nl subtitles, jpg thumbnail sidecar', () => {
    expect(videoExtraArgs(video)).toEqual([
      '--remux-video',
      'mkv',
      '--embed-subs',
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
      'mkv',
      '--write-subs',
      '--sub-langs',
      'en,nl',
    ]);
    expect(
      videoExtraArgs({ ...video, container: 'webm', subtitleLanguages: [], saveThumbnails: false }),
    ).toEqual([]);
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

describe('DownloadProgressTracker', () => {
  it('runs one bar across the video and audio streams and never goes back', () => {
    const tracker = new DownloadProgressTracker();
    expect(tracker.update(downloading(450, 900))).toMatchObject({ progress: 0.5, totalBytes: 900 });
    expect(tracker.update({ ...downloading(900, 900), status: 'finished' })).toMatchObject({
      totalBytes: 900,
    });
    // The audio starts: the total grows, the bar holds its place.
    const audioStart = tracker.update(downloading(10, 100));
    expect(audioStart?.totalBytes).toBe(1000);
    expect(audioStart?.progress).toBeGreaterThanOrEqual(0.5);
    expect(tracker.update(downloading(100, 100))?.progress).toBe(0.99);
    expect(
      tracker.update({
        ...downloading(0, null),
        status: 'postprocessing',
        postprocessor: 'Merger',
      }),
    ).toEqual({ speedBytesPerSec: null, etaSeconds: null });
  });

  it('uses the percentage when sizes are unknown', () => {
    const tracker = new DownloadProgressTracker();
    const report = tracker.update(downloading(0, null, 25));
    expect(report).toMatchObject({ progress: 0.25, totalBytes: null });
  });
});
