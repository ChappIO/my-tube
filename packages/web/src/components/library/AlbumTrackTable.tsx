import type { TrackListItem } from '@mytube/shared';
import { countOf, formatLength, relativeTime } from '../../format';
import { playable } from '../player/queues';
import { cx, focusRing, focusRingInset, hitArea } from '../ui/cx';
import { TableHeaderLabel } from '../ui/typography';
import { CellMeta, TrackStatusLabel } from './TrackTable';
import { albumFileNames, trackNumberLabel } from './album-page';
import { trackStatus } from './track-list';

/** The wide grid: `# / Title / File / Length / Added / Status` (+ add to queue), gap 16. */
const WIDE_GRID =
  'wide:grid wide:grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1.6fr)_64px_100px_104px] wide:gap-4';

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
  /** A row click: plays the album from that track (rows of tracks not on disk do nothing). */
  onPlay: (track: TrackListItem) => void;
  /** The row's "+": adds the track to the player's queue. */
  onAdd: (track: TrackListItem) => void;
  /** The clock for the Added column. */
  now: number;
}

/**
 * The album page's tracks: the Tracks table's container, header and cells without sorting, in
 * album order. Columns `# / Title / File / Length / Added / Status`; File is the name relative to
 * the album folder (Space Mono, `—` when not on disk). A row on disk plays the album from it; the
 * 22px "+" after the status adds the track to the queue. A footer counts the tracks and their
 * length. Below 760px the header hides and rows collapse to list items.
 */
export function AlbumTrackTable({
  tracks,
  totalDurationSeconds,
  onPlay,
  onAdd,
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
            onPlay={playable(track) ? () => onPlay(track) : undefined}
            onAdd={() => onAdd(track)}
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
  /** Plays the album from this track; undefined for a track not on disk (no row action). */
  onPlay: (() => void) | undefined;
  onAdd: () => void;
}

/**
 * One track. Wide: number, title Archivo 500, file name, length, added, status and "+". Narrow:
 * the number, the title over the file name, the length over the status, "+" on the right.
 *
 * Overlay pattern (as in the Tracks table), so no control is nested in another: a transparent
 * full-row button plays, the cells let clicks through to it, and "+" sits above it.
 */
function AlbumTrackRow({ track, number, file, now, onPlay, onAdd }: AlbumTrackRowProps) {
  const status = trackStatus(track.status);
  const length = track.durationSeconds === null ? '—' : formatLength(track.durationSeconds);
  // A track that is not on disk (any more) shows no Added time, like its File.
  const added =
    track.status === 'on_disk' && track.downloadedAt ? relativeTime(track.downloadedAt, now) : '—';
  const add = <AddToQueueButton title={track.title} onAdd={onAdd} />;
  return (
    <li
      className={cx(
        'relative border-t border-line first:border-t-0 wide:first:border-t',
        onPlay && 'hover:bg-surface',
      )}
    >
      {onPlay && (
        <button
          type="button"
          aria-label={`Play ${track.title}`}
          // The full path, as the File cell shows only the name within the album folder.
          title={track.filePath ?? undefined}
          onClick={onPlay}
          className={cx('absolute inset-0 z-0 cursor-pointer', focusRingInset)}
        />
      )}
      <div
        className={cx(
          'pointer-events-none relative z-[1] flex w-full items-center gap-3 px-3 py-[10px] text-left font-sans text-[14px] font-normal text-ink',
          'wide:px-4 wide:py-3',
          WIDE_GRID,
        )}
      >
        <CellMeta className="w-6 shrink-0 wide:w-auto">{number}</CellMeta>
        <span className="min-w-0 flex-1 wide:contents">
          <span
            className={cx(
              'block truncate font-semibold wide:font-medium',
              onPlay ? 'text-ink' : 'text-muted',
            )}
          >
            {track.title}
          </span>
          <span className="mt-[2px] block truncate font-mono text-[11px] text-muted wide:mt-0 wide:text-[12px]">
            {file ?? '—'}
          </span>
        </span>
        <CellMeta className="hidden text-right wide:block">{length}</CellMeta>
        <CellMeta className="hidden truncate wide:block">{added}</CellMeta>
        <span className="hidden items-center justify-between gap-2 wide:flex">
          <TrackStatusLabel {...status} />
          {add}
        </span>

        {/* Narrow: the length over the status, then "+". */}
        <span className="shrink-0 text-right wide:hidden">
          <CellMeta className="block">{length}</CellMeta>
          <TrackStatusLabel {...status} small className="mt-[3px] block" />
        </span>
        <span className="shrink-0 wide:hidden">{add}</span>
      </div>
    </li>
  );
}

/**
 * The row's add to queue: a 22px "+" (Space Mono 14 muted; hover `surface2` and ink), above the
 * row's play button, so a click never plays the row.
 */
function AddToQueueButton({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Add ${title} to the queue`}
      title="Add to queue"
      onClick={(event) => {
        event.stopPropagation();
        onAdd();
      }}
      className={cx(
        'pointer-events-auto grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-chip font-mono text-[14px] leading-none text-muted hover:bg-surface2 hover:text-ink',
        hitArea,
        focusRing,
      )}
    >
      +
    </button>
  );
}
