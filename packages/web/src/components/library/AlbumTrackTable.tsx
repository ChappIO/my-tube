import type { TrackListItem } from '@mytube/shared';
import { countOf, formatLength, relativeTime } from '../../format';
import { cx, focusRingInset } from '../ui/cx';
import { TableHeaderLabel } from '../ui/typography';
import { CellMeta, TrackStatusLabel } from './TrackTable';
import { albumFileNames, trackNumberLabel } from './album-page';
import { trackStatus } from './track-list';

/** The wide grid: `# / Title / File / Length / Added / Status`, gap 16. */
const WIDE_GRID =
  'wide:grid wide:grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.6fr)_64px_100px_80px] wide:gap-4';

const COLUMNS = [
  { label: '#' },
  { label: 'Title' },
  { label: 'File' },
  { label: 'Length', right: true },
  { label: 'Added' },
  { label: 'Status' },
] as const;

export interface AlbumTrackTableProps {
  tracks: readonly TrackListItem[];
  totalDurationSeconds: number;
  onOpen: (track: TrackListItem) => void;
  /** The clock for the Added column. */
  now: number;
}

/**
 * The album page's tracks: the Tracks table's container, header and cells without sorting, in
 * album order. Columns `# / Title / File / Length / Added / Status`; File is the name relative to
 * the album folder (Space Mono, `—` when not on disk). A row opens Preview. A footer counts the
 * tracks and their length. Below 760px the header hides and rows collapse to list items.
 */
export function AlbumTrackTable({
  tracks,
  totalDurationSeconds,
  onOpen,
  now,
}: AlbumTrackTableProps) {
  const files = albumFileNames(tracks);
  return (
    <div className="overflow-hidden rounded-tile border border-line">
      <div aria-hidden="true" className={cx('hidden bg-surface px-4 py-[10px]', WIDE_GRID)}>
        {COLUMNS.map((column) => (
          <TableHeaderLabel
            key={column.label}
            className={'right' in column ? 'text-right' : undefined}
          >
            {column.label}
          </TableHeaderLabel>
        ))}
      </div>
      <ul aria-label="Tracks">
        {tracks.map((track, index) => (
          <AlbumTrackRow
            key={track.id}
            track={track}
            number={trackNumberLabel(track.trackNumber, index + 1)}
            file={files.get(track.id) ?? null}
            now={now}
            onOpen={() => onOpen(track)}
          />
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-3 py-3 wide:px-4">
        <CellMeta>{countOf(tracks.length, 'track')}</CellMeta>
        <CellMeta>{formatLength(totalDurationSeconds)}</CellMeta>
      </div>
    </div>
  );
}

interface AlbumTrackRowProps {
  track: TrackListItem;
  number: string;
  file: string | null;
  now: number;
  onOpen: () => void;
}

/**
 * One track. Wide: number, title Archivo 500, file name, length, added and status. Narrow: the
 * number, the title over the file name, the length over the status on the right. The row is one
 * button that opens Preview.
 */
function AlbumTrackRow({ track, number, file, now, onOpen }: AlbumTrackRowProps) {
  const status = trackStatus(track.status);
  const length = track.durationSeconds === null ? '—' : formatLength(track.durationSeconds);
  // A track that is not on disk (any more) shows no Added time, like its File.
  const added =
    track.status === 'on_disk' && track.downloadedAt ? relativeTime(track.downloadedAt, now) : '—';
  return (
    <li className="border-t border-line first:border-t-0 wide:first:border-t">
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          'flex w-full cursor-pointer items-center gap-3 px-3 py-[10px] text-left font-sans text-[14px] font-normal text-ink hover:bg-surface',
          'wide:px-4 wide:py-3',
          WIDE_GRID,
          focusRingInset,
        )}
      >
        <CellMeta className="w-6 shrink-0 wide:w-auto">{number}</CellMeta>
        <span className="min-w-0 flex-1 wide:contents">
          <span className="block truncate font-semibold wide:font-medium">{track.title}</span>
          <span
            title={track.filePath ?? undefined}
            className="mt-[2px] block truncate font-mono text-[11px] text-muted wide:mt-0 wide:text-[12px]"
          >
            {file ?? '—'}
          </span>
        </span>
        <CellMeta className="hidden text-right wide:block">{length}</CellMeta>
        <CellMeta className="hidden truncate wide:block">{added}</CellMeta>
        <TrackStatusLabel {...status} className="hidden wide:block" />

        {/* Narrow: the length over the status. */}
        <span className="shrink-0 text-right wide:hidden">
          <CellMeta className="block">{length}</CellMeta>
          <TrackStatusLabel {...status} small className="mt-[3px] block" />
        </span>
      </button>
    </li>
  );
}
