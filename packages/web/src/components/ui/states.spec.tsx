import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { EmptyState } from './EmptyState';
import { ErrorState, errorStateText, fromQuery, loadFailed } from './ErrorState';

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('EmptyState', () => {
  it('is a plain muted line announced as a status', () => {
    const html = renderToStaticMarkup(<EmptyState>No tracks match.</EmptyState>);
    expect(html).toContain('role="status"');
    expect(html).toContain('text-body text-muted');
    expect(text(html)).toBe('No tracks match.');
    expect(html).not.toContain('<button');
  });

  it('renders an action under the text when given one', () => {
    const html = renderToStaticMarkup(
      <EmptyState action={<button type="button">Add to library</button>}>
        Nothing downloaded yet. Add a channel or an artist to get started.
      </EmptyState>,
    );
    expect(text(html)).toBe(
      'Nothing downloaded yet. Add a channel or an artist to get started. Add to library',
    );
  });
});

describe('ErrorState', () => {
  it('names what failed and why, with Retry', () => {
    const html = renderToStaticMarkup(
      <ErrorState what="the videos" error={new TypeError('Failed to fetch')} onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(text(html)).toBe('Could not load the videos. The server did not answer. Retry');
  });

  it('disables Retry while retrying, and has none without onRetry', () => {
    const busy = renderToStaticMarkup(
      <ErrorState what="the queue" error={new ApiError(502, '')} onRetry={() => {}} retrying />,
    );
    expect(busy).toContain('disabled');
    expect(text(busy)).toBe('Could not load the queue. The server answered 502. Retrying…');
    const plain = renderToStaticMarkup(<ErrorState what="the queue" error={undefined} />);
    expect(plain).not.toContain('<button');
  });

  it('reads "show" for render errors', () => {
    expect(errorStateText('this page', new Error('x is undefined'), 'show')).toBe(
      'Could not show this page. x is undefined.',
    );
  });

  const query = (fields: Partial<Parameters<typeof loadFailed>[0]> = {}) => ({
    data: undefined,
    error: null,
    failureReason: null,
    failureCount: 0,
    isError: false,
    isFetching: false,
    refetch: () => {},
    ...fields,
  });

  it('fails a load on the first failed attempt, not only once retries give up', () => {
    expect(loadFailed(query())).toBe(false);
    expect(loadFailed(query({ failureCount: 1, isFetching: true }))).toBe(true);
    expect(loadFailed(query({ isError: true }))).toBe(true);
    // A failed refetch keeps the data on screen.
    expect(loadFailed(query({ data: [], isError: true, failureCount: 1 }))).toBe(false);
  });

  it('takes error, retry and progress from a query', () => {
    const refetch = vi.fn<() => void>();
    const reason = new ApiError(502, '');
    const retrying = fromQuery(query({ failureReason: reason, isFetching: true, refetch }));
    expect(retrying.error).toBe(reason);
    expect(retrying.retrying).toBe(true);
    retrying.onRetry?.();
    expect(refetch).toHaveBeenCalledOnce();
    const error = new ApiError(500, JSON.stringify({ message: 'Internal server error' }));
    expect(fromQuery(query({ error, failureReason: reason })).error).toBe(error);
  });
});
