import type { Job } from '@mytube/shared';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { jobLogDownloadUrl, useJobDetails, useJobLog } from '../../api/activity';
import { ApiError } from '../../api/client';
import { countOf, formatBytes, formatCount } from '../../format';
import { useNow } from '../../use-now';
import { Modal } from '../ui/Modal';
import { Meta } from '../ui/typography';
import {
  type CopyState,
  createCopyAction,
  initialLogView,
  logViewReducer,
  tailText,
  writeClipboard,
} from './job-log';
import { JobInfo } from './JobInfo';
import { LogPane } from './LogPane';
import { LogToolbar } from './LogToolbar';

export interface LogViewerModalProps {
  jobId: number;
  onClose: () => void;
}

/**
 * The log viewer, opened from a queue row (running or failed) or a history row through
 * `openJobLog(jobId)` and rendered by `AppShell`: the large `Modal` (whole screen below 760px)
 * with the job's facts (`JobInfo`) at the top and the log block (`LogPane`, with the
 * `LogToolbar` fused to its top) filling the rest. The log is fetched again every 2 s while the job runs and once more when it
 * stops. Escape and a click outside close it.
 */
export function LogViewerModal({ jobId, onClose }: LogViewerModalProps) {
  const details = useJobDetails(jobId);
  // A running job's duration counts up every second.
  const now = useNow(1_000);
  const job = details.job;
  const title = job?.title ?? `Job ${jobId}`;
  let note: string | null = null;
  if (details.isPending) note = 'Loading the job.';
  else if (details.error instanceof ApiError && details.error.status === 404)
    note = 'This job is no longer known.';
  else if (details.error) note = 'Could not load the job.';

  return (
    <Modal open onClose={onClose} aria-label={`Log of ${title}`} size="large">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 wide:p-7">
        <JobInfo job={job} fallbackTitle={title} note={note} onClose={onClose} now={now} />
        {/* Mounted once the job is known, so auto-scroll starts on for a running job. */}
        {!details.isPending && <JobLogBody jobId={jobId} job={job} title={title} />}
      </div>
    </Modal>
  );
}

function JobLogBody({ jobId, job, title }: { jobId: number; job: Job | undefined; title: string }) {
  const running = job?.status === 'running';
  const log = useJobLog(jobId, { live: running });
  const [view, dispatch] = useReducer(logViewReducer, running, initialLogView);
  const copyState = useCopyAction();

  const tail = useMemo(() => (log.data === undefined ? null : tailText(log.data)), [log.data]);
  const lineCount = useMemo(
    () => (tail === null ? 0 : tail.droppedLines + tail.text.split('\n').length),
    [tail],
  );

  let status: string | null = null;
  if (log.isPending) status = 'Loading the log.';
  else if (log.error instanceof ApiError && log.error.status === 404) status = 'No log yet.';
  else if (log.isError && log.data === undefined) status = 'Could not load the log.';

  const toolbar = (
    <LogToolbar
      view={view}
      copyState={copyState.state}
      onCopy={() => {
        if (log.data !== undefined) void copyState.copy(log.data);
      }}
      onDownload={() => window.location.assign(jobLogDownloadUrl(jobId))}
      onToggleWrap={() => dispatch({ type: 'toggle-wrap' })}
      onToggleAutoScroll={() => dispatch({ type: 'toggle-auto-scroll' })}
      empty={log.data === undefined}
      lines={tail ? countOf(lineCount, 'line') : null}
      size={log.data === undefined ? null : formatBytes(log.data.length)}
    />
  );

  return (
    <>
      {tail && tail.droppedLines > 0 && (
        <Meta as="p">
          {`The log is over 2 MB: the first ${formatCount(tail.droppedLines)} lines are left out. Download has the whole log.`}
        </Meta>
      )}
      <LogPane
        text={tail?.text ?? ''}
        wrap={view.wrap}
        autoScroll={view.autoScroll}
        onScrolled={(atBottom) => dispatch({ type: 'scrolled', atBottom, running })}
        label={`Log of ${title}`}
        status={status}
        toolbar={toolbar}
      />
    </>
  );
}

/** Copy's state for the toolbar: `copied` or `failed` for 1.5 s after a copy, then `idle`. */
function useCopyAction(): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>('idle');
  const [action] = useState(() => createCopyAction(writeClipboard, setState));
  useEffect(() => action.dispose, [action]);
  return { state, copy: action.copy };
}
