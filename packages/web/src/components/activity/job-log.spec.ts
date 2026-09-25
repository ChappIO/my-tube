import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JOB_LOG_POLL_MS,
  jobLogDownloadUrl,
  jobLogQuery,
  jobLogUrl,
  jobQuery,
} from '../../api/activity';
import { ApiError } from '../../api/client';
import {
  COPIED_MS,
  type CopyState,
  copyLabel,
  createCopyAction,
  initialLogView,
  isAtBottom,
  logViewReducer,
  splitTimestamp,
  tailText,
} from './job-log';

describe('jobLogQuery (useJobLog)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('polls every 2 s while the job runs and not at all otherwise', () => {
    expect(jobLogQuery(7, { live: true }).refetchInterval).toBe(JOB_LOG_POLL_MS);
    expect(JOB_LOG_POLL_MS).toBe(2000);
    expect(jobLogQuery(7, { live: false }).refetchInterval).toBe(false);
    // One cache entry per job, live or not, so opening a finished row reuses the last fetch.
    expect(jobLogQuery(7, { live: true }).queryKey).toEqual(
      jobLogQuery(7, { live: false }).queryKey,
    );
  });

  it('fetches the plain-text log and does not retry a missing one', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(new Response('line 1\nline 2\n')),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(jobLogQuery(7, { live: true }).queryFn()).resolves.toBe('line 1\nline 2\n');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/jobs/7/log');
    const { retry } = jobLogQuery(7, { live: true });
    expect(retry(0, new ApiError(404, ''))).toBe(false);
    expect(retry(0, new ApiError(500, ''))).toBe(true);
    expect(retry(2, new ApiError(500, ''))).toBe(false);
  });

  it('links the inline log and the download', () => {
    expect(jobLogUrl(7)).toBe('/api/jobs/7/log');
    expect(jobLogDownloadUrl(7)).toBe('/api/jobs/7/log?download=1');
  });
});

describe('jobQuery (the viewer header outside the queue)', () => {
  it('reads GET /api/jobs/:id and does not retry an unknown job', () => {
    const query = jobQuery(7);
    expect(query.queryKey).toEqual(['activity', 'job', 7]);
    expect(query.retry(0, new ApiError(404, ''))).toBe(false);
    expect(query.retry(0, new ApiError(502, ''))).toBe(true);
  });
});

describe('tailText', () => {
  it('keeps a log within the limit whole, without the trailing newline', () => {
    expect(tailText('a\nb\n')).toEqual({ text: 'a\nb', droppedLines: 0 });
  });

  it('keeps the newest whole lines of a longer log and counts the rest', () => {
    // 10 lines of 4 characters plus newlines.
    const log = Array.from({ length: 10 }, (_, i) => `ln_${i}`).join('\n');
    const tail = tailText(log, 12);
    expect(tail).toEqual({ text: 'ln_8\nln_9', droppedLines: 8 });
    // A cut exactly at a line start keeps that line.
    expect(tailText(log, 14)).toEqual({ text: 'ln_7\nln_8\nln_9', droppedLines: 7 });
  });
});

describe('splitTimestamp', () => {
  it('splits the HH:MM:SS.mmm prefix off a line', () => {
    expect(splitTimestamp('09:05:07.042 $ yt-dlp --version')).toEqual({
      time: '09:05:07.042 ',
      rest: '$ yt-dlp --version',
    });
    expect(splitTimestamp('=== download job 3 · attempt 1 of 3')).toEqual({
      time: null,
      rest: '=== download job 3 · attempt 1 of 3',
    });
    expect(splitTimestamp('9:05:07 not a stamp').time).toBeNull();
  });
});

describe('logViewReducer', () => {
  it('starts without wrapping, auto-scrolling only for a running job', () => {
    expect(initialLogView(true)).toEqual({ wrap: false, autoScroll: true });
    expect(initialLogView(false)).toEqual({ wrap: false, autoScroll: false });
  });

  it('flips the toggles', () => {
    const view = initialLogView(false);
    const wrapped = logViewReducer(view, { type: 'toggle-wrap' });
    expect(wrapped).toEqual({ wrap: true, autoScroll: false });
    expect(logViewReducer(wrapped, { type: 'toggle-wrap' }).wrap).toBe(false);
    const following = logViewReducer(view, { type: 'toggle-auto-scroll' });
    expect(following.autoScroll).toBe(true);
    expect(logViewReducer(following, { type: 'toggle-auto-scroll' }).autoScroll).toBe(false);
  });

  it('stops following when the reader scrolls up and resumes at the bottom while running', () => {
    const on = initialLogView(true);
    const up = logViewReducer(on, { type: 'scrolled', atBottom: false, running: true });
    expect(up.autoScroll).toBe(false);
    const back = logViewReducer(up, { type: 'scrolled', atBottom: true, running: true });
    expect(back.autoScroll).toBe(true);
    // Scrolling at the bottom changes nothing (the same object, no re-render).
    expect(logViewReducer(back, { type: 'scrolled', atBottom: true, running: true })).toBe(back);
  });

  it('does not turn auto-scroll on by itself for a finished job, but keeps a chosen one', () => {
    const off = initialLogView(false);
    expect(logViewReducer(off, { type: 'scrolled', atBottom: true, running: false })).toBe(off);
    const chosen = logViewReducer(off, { type: 'toggle-auto-scroll' });
    expect(
      logViewReducer(chosen, { type: 'scrolled', atBottom: true, running: false }).autoScroll,
    ).toBe(true);
    expect(
      logViewReducer(chosen, { type: 'scrolled', atBottom: false, running: false }).autoScroll,
    ).toBe(false);
  });
});

describe('isAtBottom', () => {
  it('counts the bottom and 16px above it as the bottom', () => {
    expect(isAtBottom(760, 240, 1000)).toBe(true);
    expect(isAtBottom(750, 240, 1000)).toBe(true);
    expect(isAtBottom(500, 240, 1000)).toBe(false);
    // A log shorter than the pane is always at the bottom.
    expect(isAtBottom(0, 240, 100)).toBe(true);
  });
});

describe('createCopyAction', () => {
  afterEach(() => vi.useRealTimers());

  it('reads Copied for 1.5 s after a copy, restarting on a second copy', async () => {
    vi.useFakeTimers();
    const states: CopyState[] = [];
    const write = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const action = createCopyAction(write, (state) => states.push(state));

    await action.copy('the log');
    expect(write).toHaveBeenCalledWith('the log');
    expect(states).toEqual(['copied']);
    expect(COPIED_MS).toBe(1500);
    vi.advanceTimersByTime(1000);
    await action.copy('the log');
    vi.advanceTimersByTime(1000);
    expect(states).toEqual(['copied', 'copied']);
    vi.advanceTimersByTime(500);
    expect(states).toEqual(['copied', 'copied', 'idle']);
  });

  it('reports a refused copy, and stops its timer when disposed', async () => {
    vi.useFakeTimers();
    const states: CopyState[] = [];
    const action = createCopyAction(
      () => Promise.reject(new Error('denied')),
      (state) => states.push(state),
    );
    await action.copy('x');
    expect(states).toEqual(['failed']);
    action.dispose();
    vi.advanceTimersByTime(COPIED_MS);
    expect(states).toEqual(['failed']);
  });

  it('labels the button', () => {
    expect(copyLabel('idle')).toBe('Copy');
    expect(copyLabel('copied')).toBe('Copied');
    expect(copyLabel('failed')).toBe('Copy failed');
  });
});
