import type { Job } from '@mytube/shared';
import { useState } from 'react';
import { errorTail, queueMeta, queuePercent, queueState } from '../../format';
import { CloseIcon } from '../icons';
import { IconButton } from '../ui/IconButton';
import { Meta } from '../ui/typography';
import { ActivityLink } from './ActivityLink';
import { JobLogPanel } from './JobLogPanel';
import { QueueState } from './QueueState';

export interface QueueRowProps {
  job: Job;
  /** Cancels a queued or running job; dismisses a failed one. */
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
  /** An action on this row is in flight. */
  busy?: boolean;
}

/**
 * One queue row (handoff Screen 5): title Archivo 600 15, meta Space Mono 12 muted, state Space
 * Mono 700 13 (`downloading 64%` red, `queued` muted), and a full-width 4px bar (`surface`
 * track, red fill). Additions to the handoff: a small × to cancel (or dismiss a failed row), on
 * failed rows the error's last line in red with Retry, after the download the post-processing
 * step as the state (`processing · merging`) while the bar runs from 90 to 99, and on running
 * and failed rows **View log**, which opens the job's log inline (`JobLogPanel`, live while the
 * job runs). Queued rows have no log yet.
 */
export function QueueRow({ job, onCancel, onRetry, busy }: QueueRowProps) {
  const [logOpen, setLogOpen] = useState(false);
  const state = queueState(job);
  const percent = queuePercent(job);
  const meta = queueMeta(job);
  const failed = job.status === 'failed';
  const running = job.status === 'running';
  const error = failed ? errorTail(job.error) : null;
  const hasLog = running || failed;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-tile border border-line px-4 py-[14px]">
      <div className="min-w-0">
        <div className="text-nav break-words">{job.title}</div>
        {meta && (
          <Meta as="div" className="mt-[3px] break-words">
            {meta}
          </Meta>
        )}
        {hasLog && (
          <div className="mt-[6px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {error && (
              <Meta tone="red" className="min-w-0 break-words">
                {error}
              </Meta>
            )}
            {failed && (
              <ActivityLink onClick={() => onRetry(job.id)} disabled={busy}>
                Retry
              </ActivityLink>
            )}
            <ActivityLink
              onClick={() => setLogOpen((open) => !open)}
              expanded={logOpen}
              label={`${logOpen ? 'Hide' : 'View'} the log of ${job.title}`}
            >
              {logOpen ? 'Hide log' : 'View log'}
            </ActivityLink>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <QueueState text={state.text} tone={state.tone} />
        <IconButton
          size="sm"
          label={failed ? `Dismiss ${job.title}` : `Cancel ${job.title}`}
          disabled={busy}
          onClick={() => onCancel(job.id)}
        >
          <CloseIcon size={14} />
        </IconButton>
      </div>
      <div
        role="progressbar"
        aria-label={`${job.title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="col-span-full h-1 overflow-hidden rounded-[2px] bg-surface"
      >
        <div className="h-full rounded-[2px] bg-red" style={{ width: `${percent}%` }} />
      </div>
      {hasLog && logOpen && <JobLogPanel jobId={job.id} live={running} title={job.title} />}
    </li>
  );
}
