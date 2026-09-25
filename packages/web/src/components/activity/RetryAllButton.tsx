import type { Job } from '@mytube/shared';
import { useEffect, useState } from 'react';
import { useRetryFailed } from '../../api/activity';
import { apiErrorMessage } from '../../api/client';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { Body, Meta } from '../ui/typography';

/** How long `Queued 197.` stays next to the button after a Retry all. */
export const RETRY_ALL_STATUS_MS = 4_000;

/** The failed download rows of the queue: what Retry all failed queues again. */
export function failedDownloads(jobs: readonly Job[]): Job[] {
  return jobs.filter((job) => job.status === 'failed' && job.type === 'download');
}

/**
 * The copy of Retry all failed for these failed rows: the button label with the count, the
 * dialog title, and the attempts line (left out when the rows allow different attempts).
 */
export function retryAllCopy(failed: readonly Job[]): {
  label: string;
  title: string;
  note: string | null;
} {
  const count = failed.length;
  const attempts = new Set(failed.map((job) => job.maxAttempts));
  const [only] = attempts;
  return {
    label: `Retry all failed (${count})`,
    title: `Retry ${count} failed download${count === 1 ? '' : 's'}?`,
    note:
      attempts.size === 1 && only !== undefined
        ? `${count === 1 ? 'It gets' : 'Each gets'} ${only} new attempt${only === 1 ? '' : 's'}.`
        : null,
  };
}

/** `Queued 197.`, or `Nothing to retry.` when the failures were already gone. */
export function retryAllStatus(retried: number): string {
  return retried === 0 ? 'Nothing to retry.' : `Queued ${retried}.`;
}

export interface RetryAllButtonProps {
  /** The Activity queue; the button counts its failed downloads. */
  jobs: readonly Job[];
}

/**
 * Retry all failed, in the queue section header: an outlined pill with the count of failed
 * downloads (absent while there are none). It confirms in `RetryAllModal`, then
 * `POST /api/jobs/retry-failed` with `{ type: 'download' }`; `Queued N.` shows next to it for a
 * few seconds while the queue refetches.
 */
export function RetryAllButton({ jobs }: RetryAllButtonProps) {
  const failed = failedDownloads(jobs);
  const retryAll = useRetryFailed();
  const [confirming, setConfirming] = useState(false);
  const { isSuccess, reset } = retryAll;
  useEffect(() => {
    if (!isSuccess) return undefined;
    const timer = setTimeout(reset, RETRY_ALL_STATUS_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);

  const status = retryAll.data ? retryAllStatus(retryAll.data.retried) : undefined;
  if (failed.length === 0 && !status) return null;
  const copy = retryAllCopy(failed);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Takes no room while empty, so the pill lines up with the section label when narrow. */}
      <div role="status" className="empty:hidden">
        {status && <Meta>{status}</Meta>}
      </div>
      {failed.length > 0 && (
        <Button
          variant="outlined"
          disabled={retryAll.isPending}
          onClick={() => {
            retryAll.reset();
            setConfirming(true);
          }}
        >
          {copy.label}
        </Button>
      )}
      {confirming && (
        <RetryAllModal
          title={copy.title}
          note={copy.note}
          pending={retryAll.isPending}
          error={
            retryAll.isError ? apiErrorMessage(retryAll.error, 'Could not retry them.') : undefined
          }
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            retryAll.mutate({ type: 'download' }, { onSuccess: () => setConfirming(false) })
          }
        />
      )}
    </div>
  );
}

export interface RetryAllModalProps {
  /** `Retry 197 failed downloads?` */
  title: string;
  /** `Each gets 3 new attempts.`, or null. */
  note: string | null;
  /** The request is in flight: Retry all reads `Retrying…` and is disabled. */
  pending: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

/** Confirms Retry all failed: Cancel / **Retry all**. */
export function RetryAllModal({
  title,
  note,
  pending,
  error,
  onClose,
  onConfirm,
}: RetryAllModalProps) {
  return (
    <Modal open onClose={onClose} title={title} width="min(460px, 100%)">
      <Body>They go back in the queue as fresh downloads.{note ? ` ${note}` : ''}</Body>
      <div className="grid gap-2">
        <StatusLine>{error}</StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" disabled={pending} onClick={onConfirm}>
            {pending ? 'Retrying…' : 'Retry all'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
