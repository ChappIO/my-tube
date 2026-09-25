import type { Job } from '@mytube/shared';
import type { ReactNode } from 'react';
import {
  type JobTone,
  errorTail,
  formatBytes,
  formatSpeed,
  jobAttempt,
  jobDuration,
  jobState,
  jobTime,
} from '../../format';
import { CloseIcon } from '../icons';
import { cx } from '../ui/cx';
import { IconButton } from '../ui/IconButton';
import { Body, Meta, ModalTitle } from '../ui/typography';

export interface JobInfoProps {
  /** The job, or undefined while it loads or when it is unknown (`fallbackTitle` then). */
  job: Job | undefined;
  /** The title while there is no job: `Job 42`. */
  fallbackTitle: string;
  /** A line in place of the facts: "Loading the job.", "This job is no longer known." */
  note?: string | null;
  onClose: () => void;
  /** The clock for a running job's duration (`useNow`). */
  now: number;
}

/**
 * The log viewer's header: title (the modal title) over the channel or artist, the status pill
 * and the close button on the right, then the facts (type, attempt, created, started,
 * finished, duration, size, speed, job id) as muted Archivo labels over Space Mono values, and
 * for a failed job the error's last line in red Space Mono.
 */
export function JobInfo({ job, fallbackTitle, note, onClose, now }: JobInfoProps) {
  const state = job ? jobState(job) : null;
  const error = job?.status === 'failed' ? errorTail(job.error) : null;
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <ModalTitle className="break-words">{job?.title ?? fallbackTitle}</ModalTitle>
          {job?.subtitle && (
            <Body muted className="mt-1 break-words">
              {job.subtitle}
            </Body>
          )}
          {/* Narrow: the pill goes under the title, which gets the whole width. */}
          {state && (
            <JobStatusPill
              text={state.text}
              tone={state.tone}
              className="mt-2 inline-block wide:hidden"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {state && (
            <JobStatusPill
              text={state.text}
              tone={state.tone}
              className="hidden wide:inline-block"
            />
          )}
          <IconButton label="Close" size="sm" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
      </div>
      {note && <Body muted>{note}</Body>}
      {job && <JobFacts job={job} now={now} />}
      {error && (
        <Meta as="p" tone="red" className="break-words">
          {error}
        </Meta>
      )}
    </div>
  );
}

function JobFacts({ job, now }: { job: Job; now: number }) {
  const duration = jobDuration(job, now);
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 wide:flex wide:flex-wrap wide:gap-x-8">
      <JobFact label="Type">{job.type}</JobFact>
      <JobFact label="Attempt">{jobAttempt(job)}</JobFact>
      <JobFact label="Created">{jobTime(job.createdAt)}</JobFact>
      {job.startedAt && <JobFact label="Started">{jobTime(job.startedAt)}</JobFact>}
      {job.finishedAt && <JobFact label="Finished">{jobTime(job.finishedAt)}</JobFact>}
      {duration && <JobFact label="Duration">{duration}</JobFact>}
      {job.totalBytes ? <JobFact label="Size">{formatBytes(job.totalBytes)}</JobFact> : null}
      {job.status === 'running' && job.speedBytesPerSec ? (
        <JobFact label="Speed">{formatSpeed(job.speedBytesPerSec)}</JobFact>
      ) : null}
      <JobFact label="Job">{`#${job.id}`}</JobFact>
    </dl>
  );
}

/** One fact: Archivo 12 muted label over a Space Mono 12 value. */
function JobFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-sans text-[12px] text-muted">{label}</dt>
      <dd className="mt-[2px] font-mono text-[12px] break-words text-ink">{children}</dd>
    </div>
  );
}

const pillTones: Record<JobTone, string> = {
  red: 'text-red',
  muted: 'text-muted',
  ok: 'text-ok',
};

/** The status as a chip: the queue state's text and colour, Space Mono 700 12 on `surface`. */
function JobStatusPill({
  text,
  tone,
  className,
}: {
  text: string;
  tone: JobTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'rounded-pill bg-surface px-[10px] py-1 font-mono text-[12px] font-bold whitespace-nowrap',
        pillTones[tone],
        className,
      )}
    >
      {text}
    </span>
  );
}
