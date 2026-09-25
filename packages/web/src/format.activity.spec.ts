import type { Job } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { summaryPollMs } from './api/activity';
import {
  errorTail,
  formatSpeed,
  queueMeta,
  queuePercent,
  queueState,
  stageLabel,
  resultTone,
  whenLabel,
} from './format';

const job: Job = {
  id: 1,
  type: 'download',
  status: 'running',
  title: 'The plan to fix everything, ep. 42',
  subtitle: 'Deep Dive Podcast',
  progress: 0.643,
  speedBytesPerSec: 4_100_000,
  etaSeconds: 30,
  totalBytes: 1_200_000_000,
  stage: null,
  detail: '1080p',
  error: null,
  attempts: 0,
  maxAttempts: 3,
  runAfter: null,
  createdAt: '2026-09-24T12:00:00.000Z',
  startedAt: '2026-09-24T12:00:01.000Z',
  finishedAt: null,
  updatedAt: '2026-09-24T12:00:02.000Z',
};

describe('sizes and speeds', () => {
  it('formats bytes per second in decimal units', () => {
    expect(formatSpeed(4_100_000)).toBe('4.1 MB/s');
    expect(formatSpeed(396_000)).toBe('396 KB/s');
  });
});

describe('queue rows', () => {
  it('builds the meta line from what is known', () => {
    expect(queueMeta(job)).toBe('Deep Dive Podcast · 1080p · 1.2 GB · 4.1 MB/s');
    expect(queueMeta({ ...job, status: 'queued', totalBytes: null, speedBytesPerSec: null })).toBe(
      'Deep Dive Podcast · 1080p',
    );
    expect(queueMeta({ ...job, status: 'queued', attempts: 1, totalBytes: null })).toBe(
      'Deep Dive Podcast · 1080p · attempt 2 of 3',
    );
  });

  it('names the state and the bar width', () => {
    expect(queueState(job)).toEqual({ text: 'downloading 64%', tone: 'red' });
    expect(queuePercent(job)).toBe(64);
    expect(queueState({ ...job, status: 'queued' })).toEqual({ text: 'queued', tone: 'muted' });
    expect(queuePercent({ ...job, status: 'queued' })).toBe(0);
    expect(queueState({ ...job, progress: null }).text).toBe('starting');
    expect(queueState({ ...job, type: 'check_source', progress: null }).text).toBe('checking');
    expect(queueState({ ...job, status: 'failed' })).toEqual({ text: 'failed', tone: 'red' });
  });

  it('names the post-processing stage once the bytes are in', () => {
    const merging = { ...job, progress: 0.911, stage: 'Merger', speedBytesPerSec: null };
    expect(queueState(merging)).toEqual({ text: 'processing · merging', tone: 'red' });
    expect(queuePercent(merging)).toBe(91);
    expect(queueMeta(merging)).toBe('Deep Dive Podcast · 1080p · 1.2 GB');
    // A stage left on a row that is no longer running does not show.
    expect(queueState({ ...merging, status: 'queued' }).text).toBe('queued');
    expect(
      [
        'Merger',
        'VideoRemuxer',
        'FFmpegVideoRemuxer',
        'EmbedSubtitle',
        'FFmpegEmbedSubtitle',
        'ThumbnailsConvertor',
        'FFmpegThumbnailsConvertor',
        'EmbedThumbnail',
        'MoveFiles',
        'MoveFilesAfterDownload',
        'FFmpegMetadata',
        'Metadata',
        'SponsorBlock',
      ].map(stageLabel),
    ).toEqual([
      'merging',
      'remuxing',
      'remuxing',
      'embedding subtitles',
      'embedding subtitles',
      'converting thumbnail',
      'converting thumbnail',
      'embedding thumbnail',
      'moving file',
      'moving file',
      'writing tags',
      'writing tags',
      'sponsorblock',
    ]);
  });

  it('keeps the last line of an error', () => {
    expect(errorTail('WARNING: x\nERROR: [youtube] abc: Video unavailable\n')).toBe(
      'ERROR: [youtube] abc: Video unavailable',
    );
    expect(errorTail(null)).toBeNull();
  });
});

const now = new Date(2026, 8, 24, 15, 30);
const local = (day: number, hours: number, minutes: number) =>
  new Date(2026, 8, day, hours, minutes).toISOString();

describe('whenLabel', () => {
  it('groups by local day', () => {
    expect(whenLabel(local(24, 8, 12), now)).toBe('Today 08:12');
    expect(whenLabel(local(24, 0, 0), now)).toBe('Today 00:00');
    expect(whenLabel(local(23, 23, 59), now)).toBe('Yesterday 23:59');
    expect(whenLabel(local(22, 6, 0), now)).toBe('2 days ago');
    expect(whenLabel(local(18, 6, 0), now)).toBe('6 days ago');
    expect(whenLabel(local(17, 6, 0), now)).toBe('2026-09-17');
    // A clock slightly behind the server still reads as today.
    expect(whenLabel(local(24, 15, 31), now)).toBe('Today 15:31');
  });
});

describe('results and polling', () => {
  it('colours results by outcome', () => {
    expect(resultTone('done')).toBe('ok');
    expect(resultTone('updated')).toBe('ok');
    expect(resultTone('installed')).toBe('ok');
    expect(resultTone('failed')).toBe('red');
    expect(resultTone('removed, older than 90 days')).toBe('muted');
  });

  it('polls the badge faster while downloads are active', () => {
    expect(summaryPollMs(undefined)).toBe(30_000);
    expect(summaryPollMs({ activeDownloads: 0, queued: 3 })).toBe(30_000);
    expect(summaryPollMs({ activeDownloads: 2, queued: 1 })).toBe(5_000);
  });
});
