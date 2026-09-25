import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTracks } from '../../api/library';
import { useDebounced } from '../../use-debounced';
import { useNow } from '../../use-now';
import { startQueue, tracksTableQueue } from '../player/queues';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { TrackTable } from './TrackTable';
import { TrackSortPills, TracksToolbar } from './TracksToolbar';
import {
  type TrackListState,
  nextSort,
  toTrackSearch,
  trackCountText,
  trackListState,
} from './track-list';

/** The filter text reaches the URL (and the API) once typing pauses this long. */
const FILTER_DEBOUNCE_MS = 300;

/**
 * Music → Tracks: the toolbar, the narrow sort pills, the table and **Load
 * more** (60 per page). A row plays that track alone. Filtering and sorting are server-side (`GET /api/library/tracks`); the
 * filter text, the filter and the sort are the URL search params of `/music/tracks`.
 */
export function TracksTab() {
  const search = useSearch({ from: '/music/$tab' });
  const navigate = useNavigate({ from: '/music/$tab' });
  const state = trackListState(search);
  const update = (patch: Partial<TrackListState>, replace = false) =>
    void navigate({
      search: toTrackSearch({ ...state, ...patch }),
      replace,
      resetScroll: false,
    });

  const [text, setText] = useFilterText(state.q, (q) => update({ q }, true));
  const tracks = useTracks(state);
  const now = useNow();

  const first = tracks.data?.pages[0];
  const items = tracks.data?.pages.flatMap((page) => page.items) ?? [];
  // The queue is the table as filtered and sorted, as far as it is loaded (Load more adds pages
  // to the table, not to a queue that is already playing).
  const play = (track: { id: number }) => startQueue(tracksTableQueue(items, track.id));
  const onSort = (column: TrackListState['sort']) => update(nextSort(state, column));

  return (
    <>
      <TracksToolbar
        text={text}
        onText={setText}
        filter={state.filter}
        onFilter={(filter) => update({ filter })}
        count={first ? trackCountText(first.total, first.libraryTotal) : undefined}
      />
      <TrackSortPills sort={state.sort} dir={state.dir} onSort={onSort} />
      {loadFailed(tracks) ? (
        <ErrorState what="the tracks" {...fromQuery(tracks)} />
      ) : tracks.isPending ? (
        <StatusLine>Loading tracks.</StatusLine>
      ) : first?.libraryTotal === 0 ? (
        <EmptyState>No tracks yet. Add an artist with + Add to library.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>No tracks match.</EmptyState>
      ) : (
        <TrackTable
          tracks={items}
          sort={state.sort}
          dir={state.dir}
          onSort={onSort}
          onPlay={play}
          now={now}
        />
      )}
      {tracks.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outlined"
            disabled={tracks.isFetchingNextPage}
            onClick={() => void tracks.fetchNextPage()}
          >
            {tracks.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
      {tracks.isFetchNextPageError && (
        <ErrorState
          what="more tracks"
          error={tracks.error}
          onRetry={() => void tracks.fetchNextPage()}
          retrying={tracks.isFetchingNextPage}
        />
      )}
    </>
  );
}

/**
 * The filter box's text: typed freely, committed (trimmed) once typing pauses. A new `q` from
 * the URL (back and forward) replaces the text unless it is what was typed.
 */
function useFilterText(q: string, commit: (q: string) => void): [string, (text: string) => void] {
  const [text, setText] = useState(q);
  const [seen, setSeen] = useState(q);
  if (seen !== q) {
    setSeen(q);
    if (text.trim() !== q) setText(q);
  }
  const settled = useDebounced(text.trim(), FILTER_DEBOUNCE_MS);
  useEffect(() => {
    if (settled !== q) commit(settled);
    // Only a settled change commits; `q` and `commit` change with every navigation.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  return [text, setText];
}
