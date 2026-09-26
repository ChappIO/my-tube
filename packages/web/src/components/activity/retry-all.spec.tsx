import type { Job } from '@mytube/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryFailedJobs } from '../../api/activity';
import {
  RetryAllButton,
  RetryAllModal,
  failedDownloads,
  retryAllCopy,
  retryAllStatus,
} from './RetryAllButton';

// Modals portal into document.body; render them in place so the server renderer can.
vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (node: ReactNode) => node,
}));

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const AT = '2026-09-25T12:00:00.000Z';

function job(id: number, patch: Partial<Job> = {}): Job {
  return {
    id,
    type: 'download',
    status: 'failed',
    title: `Video ${id}`,
    subtitle: null,
    progress: null,
    speedBytesPerSec: null,
    etaSeconds: null,
    totalBytes: null,
    stage: null,
    detail: null,
    error: 'ERROR: boom',
    attempts: 3,
    maxAttempts: 3,
    runAfter: null,
    createdAt: AT,
    startedAt: null,
    finishedAt: AT,
    updatedAt: AT,
    ...patch,
  };
}

function render(node: ReactNode): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
}

describe('RetryAllButton', () => {
  it('is absent while no download failed', () => {
    expect(render(<RetryAllButton jobs={[]} />)).toBe('');
    const others = [job(1, { status: 'queued' }), job(2, { type: 'check_source' })];
    expect(render(<RetryAllButton jobs={others} />)).toBe('');
  });

  it('counts the failed downloads in its label', () => {
    const jobs = [job(1), job(2), job(3, { status: 'running' }), job(4, { type: 'rescan' })];
    expect(failedDownloads(jobs).map((row) => row.id)).toEqual([1, 2]);
    const html = render(<RetryAllButton jobs={jobs} />);
    expect(text(html)).toBe('Retry all failed (2)');
    expect(html).toContain('type="button"');
  });
});

describe('retryAllCopy', () => {
  it('names the count and the attempts each job gets', () => {
    const failed = Array.from({ length: 197 }, (_, index) => job(index + 1));
    expect(retryAllCopy(failed)).toEqual({
      label: 'Retry all failed (197)',
      title: 'Retry 197 failed downloads?',
      note: 'Each gets 3 new attempts.',
    });
    expect(retryAllCopy([job(1)])).toEqual({
      label: 'Retry all failed (1)',
      title: 'Retry 1 failed download?',
      note: 'It gets 3 new attempts.',
    });
    expect(retryAllCopy([job(1), job(2, { maxAttempts: 5 })]).note).toBeNull();
  });

  it('reports what was queued', () => {
    expect(retryAllStatus(197)).toBe('Queued 197.');
    expect(retryAllStatus(0)).toBe('Nothing to retry.');
  });
});

describe('RetryAllModal', () => {
  beforeEach(() => vi.stubGlobal('document', { body: {} }));
  afterEach(() => vi.unstubAllGlobals());

  const props = {
    title: 'Retry 197 failed downloads?',
    note: 'Each gets 3 new attempts.',
    onClose: () => {},
    onConfirm: () => {},
  };

  it('asks before queueing them again', () => {
    const html = renderToStaticMarkup(<RetryAllModal {...props} pending={false} />);
    expect(text(html)).toContain('Retry 197 failed downloads?');
    expect(text(html)).toContain(
      'They go back in the queue as fresh downloads. Each gets 3 new attempts.',
    );
    expect(text(html)).toContain('Cancel Retry all');
  });

  it('disables Retry all while the request runs, and shows an error', () => {
    const html = renderToStaticMarkup(
      <RetryAllModal {...props} pending error="Could not retry them." />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retrying…<\/button>/);
    expect(text(html)).toContain('Could not retry them.');
  });
});

describe('retryFailedJobs', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('posts the type to /api/jobs/retry-failed and reads the count', async () => {
    fetchMock.mockResolvedValue(Response.json({ retried: 197 }, { status: 202 }));
    expect(await retryFailedJobs({ type: 'download' })).toEqual({ retried: 197 });
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/jobs/retry-failed');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ type: 'download' }));
  });
});
