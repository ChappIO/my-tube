import type { HistoryEntry } from '@mytube/shared';
import { jobLogUrl } from '../../api/activity';
import { resultTone, whenLabel } from '../../format';
import { Meta } from '../ui/typography';
import { ActivityLink } from './ActivityLink';

export interface HistoryTableProps {
  entries: readonly HistoryEntry[];
  /** The clock for the "when" labels (tests); defaults to now. */
  now?: Date;
}

/**
 * The History list: a bordered container of rows, grid `120px 1fr auto auto`
 * (when, title, kind chip, result) with gap 16 and 12px 16px padding; below 760px `1fr auto`
 * with when and kind hidden. `when` groups by day (`Today 08:12`, `Yesterday 21:40`,
 * `3 days ago`). Results: `done`, `updated`, `installed` green, `failed` red, the rest muted.
 * Rows written by a job get a View log link (for troubleshooting);
 * `details` (the file path or the error) is the row's tooltip.
 */
export function HistoryTable({ entries, now = new Date() }: HistoryTableProps) {
  return (
    <ul className="overflow-hidden rounded-tile border border-line">
      {entries.map((entry) => (
        <li
          key={entry.id}
          title={entry.details ?? undefined}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-line px-4 py-3 font-sans text-[13px] first:border-t-0 wide:grid-cols-[120px_minmax(0,1fr)_auto_auto]"
        >
          <Meta className="hidden whitespace-nowrap wide:block">
            <time dateTime={entry.at}>{whenLabel(entry.at, now)}</time>
          </Meta>
          <span className="truncate font-medium">{entry.title}</span>
          <span className="hidden rounded-pill bg-surface px-2 py-[3px] font-mono text-[11px] wide:block">
            {entry.kind}
          </span>
          <span className="flex items-baseline justify-end gap-3 whitespace-nowrap">
            <Meta tone={resultTone(entry.result)}>{entry.result}</Meta>
            {entry.jobId !== null && (
              <ActivityLink href={jobLogUrl(entry.jobId)} label={`View log of ${entry.title}`}>
                View log
              </ActivityLink>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
