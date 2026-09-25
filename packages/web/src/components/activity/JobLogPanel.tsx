import { useLayoutEffect, useRef } from 'react';
import { jobLogUrl, useJobLog } from '../../api/activity';
import { ApiError } from '../../api/client';
import { Meta } from '../ui/typography';
import { ActivityLink } from './ActivityLink';
import { isAtBottom, tailLines } from './job-log';

export interface JobLogPanelProps {
  jobId: number;
  /** The job is running: the log is fetched again every 2 s. */
  live: boolean;
  /** The job's title, for the accessible names. */
  title: string;
}

/**
 * A job's log inline under its queue row: Space Mono 12 on `surface`, radius 12, at most 240px
 * tall, long lines wrapped (no sideways scroll at 375px). Opens scrolled to the bottom and
 * follows new lines while it stays there; scrolling up to read stops the following until the
 * reader is back at the bottom. The newest `JOB_LOG_MAX_LINES` lines are shown, with a note of
 * the older ones and a link to the whole log in a new tab.
 */
export function JobLogPanel({ jobId, live, title }: JobLogPanelProps) {
  const log = useJobLog(jobId, { live });
  const ref = useRef<HTMLPreElement>(null);
  // Starts following: the panel opens at the newest lines.
  const follow = useRef(true);
  const tail = log.data === undefined ? null : tailLines(log.data);
  const shown = tail?.text;

  // New lines: scroll along while following.
  useLayoutEffect(() => {
    const element = ref.current;
    if (shown !== undefined && element && follow.current) element.scrollTop = element.scrollHeight;
  }, [shown]);

  let status: string | null = null;
  if (log.isPending) status = 'Loading the log.';
  else if (log.error instanceof ApiError && log.error.status === 404) status = 'No log yet.';
  else if (log.isError) status = 'Could not load the log.';

  return (
    <div className="col-span-full grid gap-[6px]">
      {status ? (
        <Meta as="p">{status}</Meta>
      ) : (
        <pre
          ref={ref}
          tabIndex={0}
          aria-label={`Log of ${title}`}
          onScroll={(event) => {
            const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
            follow.current = isAtBottom(scrollTop, clientHeight, scrollHeight);
          }}
          className="max-h-60 overflow-y-auto rounded-tile bg-surface px-3 py-[10px] font-mono text-[12px] leading-[1.5] break-words whitespace-pre-wrap text-ink [overflow-wrap:anywhere]"
        >
          {tail && tail.dropped > 0 && (
            <span className="text-muted">{`… ${tail.dropped} earlier lines, open the whole log\n`}</span>
          )}
          {tail?.text || ' '}
        </pre>
      )}
      <span>
        <ActivityLink href={jobLogUrl(jobId)} label={`Open the log of ${title} in a new tab`}>
          Open in new tab
        </ActivityLink>
      </span>
    </div>
  );
}
