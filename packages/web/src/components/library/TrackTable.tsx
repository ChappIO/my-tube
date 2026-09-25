import type { SortDir, TrackListItem, TrackSort } from '@mytube/shared';
import type { ReactNode } from 'react';
import { formatLength, relativeTime } from '../../format';
import { Artwork } from '../media';
import { cx, focusRingInset } from '../ui/cx';
import { TableHeaderLabel } from '../ui/typography';
import { TRACK_COLUMNS, sortArrow, trackStatus } from './track-list';

/** The wide grid: `40px 2fr 1.3fr 1.3fr 80px 110px 90px`, gap 16. */
const WIDE_GRID =
  'wide:grid wide:grid-cols-[40px_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_80px_110px_90px] wide:gap-4';

export interface TrackTableProps {
  tracks: readonly TrackListItem[];
  sort: TrackSort;
  dir: SortDir;
  onSort: (column: TrackSort) => void;
  onOpen: (track: TrackListItem) => void;
  /** The clock for the Added column. */
  now: number;
}

/**
 * The Tracks table: a bordered radius-12 list with a `surface` header row of
 * sortable column labels (every column but # and Status; the active one in `ink` with ↑/↓)
 * over rows that open Preview. Below 760px the header is hidden (`TrackSortPills` sorts
 * instead) and each row collapses to a list item.
 */
export function TrackTable({ tracks, sort, dir, onSort, onOpen, now }: TrackTableProps) {
  return (
    <div className="overflow-hidden rounded-tile border border-line">
      <TrackTableHeader sort={sort} dir={dir} onSort={onSort} />
      <ul aria-label="Tracks">
        {tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            number={index + 1}
            now={now}
            onOpen={() => onOpen(track)}
          />
        ))}
      </ul>
    </div>
  );
}

/** The header row (wide only): Space Mono 700 11 uppercase labels on `surface`, 10px 16px. */
function TrackTableHeader({ sort, dir, onSort }: Pick<TrackTableProps, 'sort' | 'dir' | 'onSort'>) {
  return (
    <div
      role="group"
      aria-label="Sort tracks"
      className={cx('hidden items-center bg-surface px-4 py-[10px]', WIDE_GRID)}
    >
      {TRACK_COLUMNS.map((column) => {
        const active = column.sort === sort;
        const align = column.align === 'right' ? 'justify-end' : 'justify-start';
        if (!column.sort) {
          return <TableHeaderLabel key={column.label}>{column.label}</TableHeaderLabel>;
        }
        const target = column.sort;
        return (
          <button
            key={column.label}
            type="button"
            aria-pressed={active}
            aria-label={
              active
                ? `${column.label}, sorted ${dir === 'asc' ? 'ascending' : 'descending'}`
                : `Sort by ${column.label}`
            }
            onClick={() => onSort(target)}
            className={cx(
              'flex cursor-pointer items-center gap-[6px] rounded-badge text-table-header select-none',
              align,
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {column.label}
            {active && <span aria-hidden="true">{sortArrow(dir)}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface TrackRowProps {
  track: TrackListItem;
  number: number;
  now: number;
  onOpen: () => void;
}

/**
 * One track. Wide: `#`, 32px cover (radius 6) + title Archivo 500, 24px round avatar + artist
 * muted, album muted, length and added in Space Mono 12 muted, status. Narrow: 44px cover,
 * title over `artist · album`, the length over the status on the right. The whole row is one
 * button that opens Preview.
 */
function TrackRow({ track, number, now, onOpen }: TrackRowProps) {
  const status = trackStatus(track.status);
  const cover = track.coverUrl ?? undefined;
  const album = track.album?.title ?? null;
  const length = track.durationSeconds === null ? '—' : formatLength(track.durationSeconds);
  const added = track.downloadedAt ? relativeTime(track.downloadedAt, now) : '—';
  return (
    <li className="border-t border-line first:border-t-0 wide:first:border-t">
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'flex w-full cursor-pointer items-center gap-3 px-3 py-[10px] text-left font-sans text-[14px] font-normal text-ink hover:bg-surface',
          'wide:items-center wide:px-4 wide:py-2',
          WIDE_GRID,
          focusRingInset,
        )}
      >
        {/* Wide cells. */}
        <CellMeta className="hidden wide:block">{number}</CellMeta>
        <span className="hidden min-w-0 items-center gap-[10px] wide:flex">
          <span className="size-8 shrink-0">
            <Artwork src={cover} seed={album ?? track.title} size="thumb" />
          </span>
          <span className="truncate font-medium">{track.title}</span>
        </span>
        <span className="hidden min-w-0 items-center gap-[10px] text-muted wide:flex">
          <span className="size-6 shrink-0">
            <Artwork
              src={track.artist.avatarUrl ?? undefined}
              seed={track.artist.name}
              shape="circle"
            />
          </span>
          <span className="truncate">{track.artist.name}</span>
        </span>
        <span className="hidden truncate text-muted wide:block">{album ?? '—'}</span>
        <CellMeta className="hidden text-right wide:block">{length}</CellMeta>
        <CellMeta className="hidden truncate wide:block">{added}</CellMeta>
        <TrackStatusLabel {...status} className="hidden wide:block" />

        {/* Narrow list item. */}
        <span className="size-11 shrink-0 wide:hidden">
          <Artwork src={cover} seed={album ?? track.title} size="list" />
        </span>
        <span className="min-w-0 flex-1 wide:hidden">
          <span className="block truncate font-semibold">{track.title}</span>
          <span className="mt-[2px] block truncate text-[12px] text-muted">
            {album ? `${track.artist.name} · ${album}` : track.artist.name}
          </span>
        </span>
        <span className="shrink-0 text-right wide:hidden">
          <CellMeta className="block">{length}</CellMeta>
          <TrackStatusLabel {...status} small className="mt-[3px] block" />
        </span>
      </button>
    </li>
  );
}

/** Space Mono 12 muted cell text (number, length, added). */
export function CellMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-mono text-[12px] text-muted', className)}>{children}</span>;
}

const STATUS_TONES = { ok: 'text-ok', red: 'text-red', muted: 'text-muted' } as const;

/** Status: Space Mono 700 11 (10 in the narrow list); `on disk` green, `missing` red. */
export function TrackStatusLabel({
  label,
  tone,
  small,
  className,
}: ReturnType<typeof trackStatus> & { small?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'font-mono font-bold whitespace-nowrap',
        small ? 'text-[10px]' : 'text-[11px]',
        STATUS_TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
