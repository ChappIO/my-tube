import type { Job } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { summaryPollMs } from './api/activity';
import {
  errorHint,
  errorTail,
  formatElapsed,
  formatSpeed,
  jobAttempt,
  jobDuration,
  jobState,
  jobTime,
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

  it('hints at the cookies for a format error while a cookies file is set', () => {
    const error =
      'yt-dlp exited with 1: [youtube] abc: Requested format is not available. Use --list-formats for a list of available formats';
    expect(errorHint(error, true)).toBe(
      'Cookies may be the cause: try Remove in Settings → Advanced → Network → Cookies.',
    );
    expect(errorHint(error, false)).toBeNull();
    expect(errorHint('yt-dlp exited with 1: [youtube] abc: Video unavailable', true)).toBeNull();
    expect(errorHint(null, true)).toBeNull();
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

describe('the log viewer header', () => {
  it('shows the queue state, then done or cancelled', () => {
    expect(jobState(job)).toEqual({ text: 'downloading 64%', tone: 'red' });
    expect(jobState({ ...job, status: 'failed' })).toEqual({ text: 'failed', tone: 'red' });
    expect(jobState({ ...job, status: 'done' })).toEqual({ text: 'done', tone: 'ok' });
    expect(jobState({ ...job, status: 'cancelled' })).toEqual({ text: 'cancelled', tone: 'muted' });
  });

  it('counts the attempt that runs or ran', () => {
    expect(jobAttempt(job)).toBe('1 of 3');
    expect(jobAttempt({ ...job, status: 'queued', attempts: 1 })).toBe('2 of 3');
    expect(jobAttempt({ ...job, status: 'failed', attempts: 3 })).toBe('3 of 3');
    // A permanent failure on the first try.
    expect(jobAttempt({ ...job, status: 'failed', attempts: 1 })).toBe('1 of 3');
    expect(jobAttempt({ ...job, status: 'done', attempts: 0 })).toBe('1 of 3');
  });

  it('formats local times to the second and durations', () => {
    const at = new Date(2026, 8, 5, 7, 3, 9).toISOString();
    expect(jobTime(at)).toBe('2026-09-05 07:03:09');
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(12_400)).toBe('12s');
    expect(formatElapsed(187_000)).toBe('3m 07s');
    expect(formatElapsed(3_840_000)).toBe('1h 04m');
  });

  it('measures a run from start to finish, or to now while running', () => {
    const clock = Date.parse('2026-09-24T12:00:31.000Z');
    expect(jobDuration(job, clock)).toBe('30s');
    expect(jobDuration({ ...job, status: 'done', finishedAt: '2026-09-24T12:01:01.000Z' })).toBe(
      '1m 00s',
    );
    expect(jobDuration({ ...job, status: 'queued', startedAt: null })).toBeNull();
    expect(jobDuration({ ...job, status: 'cancelled', finishedAt: null })).toBeNull();
  });
});
