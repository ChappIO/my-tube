import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOB_LOG_POLL_MS, jobLogQuery } from '../../api/activity';
import { ApiError } from '../../api/client';
import { JOB_LOG_MAX_LINES, isAtBottom, tailLines } from './job-log';

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
});

describe('tailLines', () => {
  it('keeps a short log whole, without the trailing newline', () => {
    expect(tailLines('a\nb\n')).toEqual({ text: 'a\nb', dropped: 0 });
  });

  it('keeps the newest lines of a long log and counts the rest', () => {
    const log = Array.from({ length: JOB_LOG_MAX_LINES + 3 }, (_, i) => `line ${i}`).join('\n');
    const tail = tailLines(log);
    expect(tail.dropped).toBe(3);
    expect(tail.text.split('\n')).toHaveLength(JOB_LOG_MAX_LINES);
    expect(tail.text.startsWith('line 3\n')).toBe(true);
    expect(tail.text.endsWith(`line ${JOB_LOG_MAX_LINES + 2}`)).toBe(true);
    expect(tailLines('a\nb\nc', 2)).toEqual({ text: 'b\nc', dropped: 1 });
  });
});

describe('isAtBottom', () => {
  it('follows new lines at (or within 16px of) the bottom, not after scrolling up', () => {
    expect(isAtBottom(760, 240, 1000)).toBe(true);
    expect(isAtBottom(750, 240, 1000)).toBe(true);
    expect(isAtBottom(500, 240, 1000)).toBe(false);
    // A log shorter than the panel is always at the bottom.
    expect(isAtBottom(0, 240, 100)).toBe(true);
  });
});
