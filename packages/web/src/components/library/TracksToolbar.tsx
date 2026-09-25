import type { SortDir, TrackFilter, TrackSort } from '@mytube/shared';
import { TRACK_FILTERS } from '@mytube/shared';
import { cx, hitArea, focusRing } from '../ui/cx';
import { Input } from '../ui/Input';
import { TabPills } from '../ui/TabPills';
import { Meta } from '../ui/typography';
import { TRACK_FILTER_LABELS, TRACK_SORT_PILLS, sortArrow } from './track-list';

const filterItems = TRACK_FILTERS.map((filter) => ({
  id: filter,
  label: TRACK_FILTER_LABELS[filter],
}));

export interface TracksToolbarProps {
  /** The filter text as typed (the URL gets it debounced). */
  text: string;
  onText: (text: string) => void;
  filter: TrackFilter;
  onFilter: (filter: TrackFilter) => void;
  /** `17 of 42 tracks`, or undefined while loading. */
  count?: string;
}

/**
 * The Tracks toolbar: the 300px pill filter input ("Filter by title, artist
 * or album"), the All / Missing / Recent filter pills and the count on the right (Space Mono 12
 * muted). Wraps on narrow screens.
 */
export function TracksToolbar({ text, onText, filter, onFilter, count }: TracksToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      <Input
        shape="pill"
        type="search"
        width={300}
        aria-label="Filter tracks"
        placeholder="Filter by title, artist or album"
        value={text}
        onChange={(event) => onText(event.target.value)}
      />
      <TabPills
        label="Show tracks"
        size="sm"
        items={filterItems}
        value={filter}
        onChange={onFilter}
      />
      <span role="status" className="ml-auto">
        {count && <Meta>{count}</Meta>}
      </span>
    </div>
  );
}

export interface TrackSortPillsProps {
  sort: TrackSort;
  dir: SortDir;
  onSort: (column: TrackSort) => void;
}

/**
 * The narrow sort row that replaces the table header below 760px: a `sort` label (Space Mono
 * 11 muted) and one outlined pill per sortable column (Archivo 600 12, 6px 12px); the active
 * one gets an `ink` border and its arrow. Repeat clicks flip the direction.
 */
export function TrackSortPills({ sort, dir, onSort }: TrackSortPillsProps) {
  return (
    <div
      role="group"
      aria-label="Sort tracks"
      className="flex flex-wrap items-center gap-[6px] wide:hidden"
    >
      <Meta size="sm">sort</Meta>
      {TRACK_SORT_PILLS.map((pill) => {
        const active = pill.sort === sort;
        return (
          <button
            key={pill.sort}
            type="button"
            aria-pressed={active}
            aria-label={
              active
                ? `Sorted by ${pill.label}, ${dir === 'asc' ? 'ascending' : 'descending'}`
                : `Sort by ${pill.label}`
            }
            onClick={() => onSort(pill.sort)}
            className={cx(
              'cursor-pointer rounded-pill border px-3 py-[6px] font-sans text-[12px] font-semibold',
              hitArea,
              focusRing,
              active ? 'border-ink text-ink' : 'border-line text-muted',
            )}
          >
            {pill.label}
            {active && ` ${sortArrow(dir)}`}
          </button>
        );
      })}
    </div>
  );
}
