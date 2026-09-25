import { loadErrorDetail } from '../../api/client';
import { Button } from './Button';
import { Body } from './typography';

export interface ErrorStateProps {
  /** What failed to load, as it reads after "Could not load": `the videos`, `this channel`. */
  what: string;
  /** The query's error; its status or message becomes the second sentence. */
  error: unknown;
  /** Loads again (the query's `refetch`). Without it there is no Retry button. */
  onRetry?: () => void;
  /** A retry is in flight: the button is disabled and reads "Retrying…". */
  retrying?: boolean;
  /** `load` for a failed request (default), `show` for a render error (the error boundary). */
  verb?: 'load' | 'show';
}

/** The parts of a React Query result an error state needs. */
interface RetryableQuery {
  data: unknown;
  error: unknown;
  /** The last failure while React Query is still retrying (before `error` is set). */
  failureReason: unknown;
  failureCount: number;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * Whether a screen should show its error state: nothing loaded yet and the request failed, for
 * good or on an attempt React Query is still retrying (so the error shows at once, with
 * "Retrying…", instead of after the whole backoff). A failed background refetch or poll keeps
 * the data on screen.
 */
export function loadFailed(query: RetryableQuery): boolean {
  return query.data === undefined && (query.isError || query.failureCount > 0);
}

/**
 * `error`, `onRetry` and `retrying` from a query, so a screen writes
 * `<ErrorState what="the videos" {...fromQuery(videos)} />`.
 */
export function fromQuery(
  query: RetryableQuery,
): Pick<ErrorStateProps, 'error' | 'onRetry' | 'retrying'> {
  return {
    error: query.error ?? query.failureReason,
    onRetry: () => void query.refetch(),
    retrying: query.isFetching,
  };
}

/** `Could not load the videos. The server did not answer.` */
export function errorStateText(
  what: string,
  error: unknown,
  verb: 'load' | 'show' = 'load',
): string {
  return `Could not ${verb} ${what}. ${loadErrorDetail(error)}`;
}

/**
 * What a screen shows when its data could not be loaded: one plain muted line naming what and
 * why (the API's message or status), and an outlined **Retry** that loads it again. Used by
 * every screen's query; the root error boundary uses the same look for render errors.
 */
export function ErrorState({ what, error, onRetry, retrying = false, verb }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Body muted>{errorStateText(what, error, verb)}</Body>
      {onRetry && (
        <Button variant="outlined" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      )}
    </div>
  );
}
