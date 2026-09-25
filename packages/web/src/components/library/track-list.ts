import {
  DEFAULT_TRACK_DIR,
  DEFAULT_TRACK_SORT,
  type ItemStatus,
  SortDir,
  TRACK_QUERY_MAX,
  TrackFilter,
  TrackSort,
} from '@mytube/shared';
import { formatCount } from '../../format';

/*
 * The Tracks tab's state and labels (pure, tested in `track-list.spec.ts`). The filter text,
 * the filter and the sort live in the URL search params of `/music/tracks`, so a reload or a
 * shared link keeps them; defaults are left out of the URL.
 */

/** The search params of `/music/$tab` (used by the Tracks tab). Absent means the default. */
export interface TrackSearch {
  q?: string;
  filter?: TrackFilter;
  sort?: TrackSort;
  dir?: SortDir;
}

/** The effective state: search params with the defaults filled in. */
export interface TrackListState {
  q: string;
  filter: TrackFilter;
  sort: TrackSort;
  dir: SortDir;
}

/**
 * `validateSearch` of `/music/$tab`: keeps what is valid, drops the rest and the defaults, so
 * `?filter=bogus` reads as All and a hand-edited URL never breaks the page.
 */
export function parseTrackSearch(raw: Record<string, unknown>): TrackSearch {
  const search: TrackSearch = {};
  if (typeof raw.q === 'string') {
    const q = raw.q.trim().slice(0, TRACK_QUERY_MAX);
    if (q !== '') search.q = q;
  }
  const filter = TrackFilter.safeParse(raw.filter);
  if (filter.success && filter.data !== 'all') search.filter = filter.data;
  const sort = TrackSort.safeParse(raw.sort);
  const dir = SortDir.safeParse(raw.dir);
  const state = {
    sort: sort.success ? sort.data : DEFAULT_TRACK_SORT,
    dir: dir.success ? dir.data : DEFAULT_TRACK_DIR,
  };
  if (state.sort !== DEFAULT_TRACK_SORT || state.dir !== DEFAULT_TRACK_DIR) {
    search.sort = state.sort;
    search.dir = state.dir;
  }
  return search;
}

export function trackListState(search: TrackSearch): TrackListState {
  return {
    q: search.q ?? '',
    filter: search.filter ?? 'all',
    sort: search.sort ?? DEFAULT_TRACK_SORT,
    dir: search.dir ?? DEFAULT_TRACK_DIR,
  };
}

/** The state back as search params, defaults left out. */
export function toTrackSearch(state: TrackListState): TrackSearch {
  return parseTrackSearch({ ...state });
}

/**
 * The sort after clicking a column (a header or a narrow sort pill): the active column flips
 * its direction; another column starts ascending (the prototype's behaviour).
 */
export function nextSort(
  current: Pick<TrackListState, 'sort' | 'dir'>,
  column: TrackSort,
): Pick<TrackListState, 'sort' | 'dir'> {
  if (current.sort === column) return { sort: column, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: column, dir: 'asc' };
}

/** The arrow after the active column's label. */
export function sortArrow(dir: SortDir): string {
  return dir === 'asc' ? '↑' : '↓';
}

/** The toolbar count: `17 of 42 tracks` (matching of all in the library). */
export function trackCountText(total: number, libraryTotal: number): string {
  return `${formatCount(total)} of ${formatCount(libraryTotal)} ${libraryTotal === 1 ? 'track' : 'tracks'}`;
}

/** The columns of the wide table in order; `sort` is null for `#` and Status. */
export const TRACK_COLUMNS: readonly {
  label: string;
  sort: TrackSort | null;
  align: 'left' | 'right';
}[] = [
  { label: '#', sort: null, align: 'left' },
  { label: 'Title', sort: 'title', align: 'left' },
  { label: 'Artist', sort: 'artist', align: 'left' },
  { label: 'Album', sort: 'album', align: 'left' },
  { label: 'Length', sort: 'length', align: 'right' },
  { label: 'Added', sort: 'added', align: 'left' },
  { label: 'Status', sort: null, align: 'left' },
];

/** The narrow sort pills: every sortable column, in table order. */
export const TRACK_SORT_PILLS = TRACK_COLUMNS.flatMap((column) =>
  column.sort ? [{ label: column.label, sort: column.sort }] : [],
);

/** The filter pills. */
export const TRACK_FILTER_LABELS: Record<TrackFilter, string> = {
  all: 'All',
  missing: 'Missing',
  recent: 'Recent',
};

export type TrackStatusTone = 'ok' | 'red' | 'muted';

/**
 * The Status cell: `on disk` green, `missing` red (was on disk, the file is gone). Tracks the
 * rules want that have not landed yet read `wanted` or `downloading`, muted; the Missing filter
 * shows them too, since they are not on disk.
 */
export function trackStatus(status: ItemStatus): { label: string; tone: TrackStatusTone } {
  switch (status) {
    case 'on_disk':
      return { label: 'on disk', tone: 'ok' };
    case 'missing':
      return { label: 'missing', tone: 'red' };
    case 'downloading':
      return { label: 'downloading', tone: 'muted' };
    default:
      return { label: status, tone: 'muted' };
  }
}
