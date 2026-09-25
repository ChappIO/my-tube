import { describe, expect, it } from 'vitest';
import { tracksUrl } from '../../api/library';
import {
  TRACK_COLUMNS,
  TRACK_SORT_PILLS,
  nextSort,
  parseTrackSearch,
  sortArrow,
  toTrackSearch,
  trackCountText,
  trackListState,
  trackStatus,
} from './track-list';

describe('trackCountText', () => {
  it('reads matching of all tracks in the library', () => {
    expect(trackCountText(17, 17)).toBe('17 of 17 tracks');
    expect(trackCountText(3, 1204)).toBe('3 of 1,204 tracks');
    expect(trackCountText(0, 0)).toBe('0 of 0 tracks');
    expect(trackCountText(1, 1)).toBe('1 of 1 track');
  });
});

describe('nextSort', () => {
  it('flips the direction on a repeat click', () => {
    expect(nextSort({ sort: 'added', dir: 'desc' }, 'added')).toEqual({
      sort: 'added',
      dir: 'asc',
    });
    expect(nextSort({ sort: 'added', dir: 'asc' }, 'added')).toEqual({
      sort: 'added',
      dir: 'desc',
    });
  });

  it('starts another column ascending', () => {
    expect(nextSort({ sort: 'added', dir: 'desc' }, 'title')).toEqual({
      sort: 'title',
      dir: 'asc',
    });
    expect(nextSort({ sort: 'title', dir: 'desc' }, 'length')).toEqual({
      sort: 'length',
      dir: 'asc',
    });
  });

  it('draws the direction as an arrow', () => {
    expect(sortArrow('asc')).toBe('↑');
    expect(sortArrow('desc')).toBe('↓');
  });
});

describe('the Tracks search params', () => {
  it('defaults to all tracks, added descending, and leaves defaults out of the URL', () => {
    expect(parseTrackSearch({})).toEqual({});
    expect(trackListState({})).toEqual({ q: '', filter: 'all', sort: 'added', dir: 'desc' });
    expect(toTrackSearch({ q: '', filter: 'all', sort: 'added', dir: 'desc' })).toEqual({});
  });

  it('keeps valid values and drops invalid ones', () => {
    expect(parseTrackSearch({ q: ' red ', filter: 'missing', sort: 'title', dir: 'asc' })).toEqual({
      q: 'red',
      filter: 'missing',
      sort: 'title',
      dir: 'asc',
    });
    expect(parseTrackSearch({ q: '   ', filter: 'lost', sort: 'rating', dir: 'up' })).toEqual({});
    expect(parseTrackSearch({ q: 42 })).toEqual({});
    expect(parseTrackSearch({ q: 'x'.repeat(300) }).q).toHaveLength(200);
  });

  it('keeps the sort and its direction together when either differs from the default', () => {
    expect(parseTrackSearch({ dir: 'asc' })).toEqual({ sort: 'added', dir: 'asc' });
    expect(parseTrackSearch({ sort: 'artist' })).toEqual({ sort: 'artist', dir: 'desc' });
    expect(
      toTrackSearch({ ...trackListState({}), ...nextSort(trackListState({}), 'added') }),
    ).toEqual({
      sort: 'added',
      dir: 'asc',
    });
  });

  it('round-trips a state through the URL params', () => {
    const state = { q: 'hiatus', filter: 'recent', sort: 'album', dir: 'desc' } as const;
    expect(trackListState(parseTrackSearch({ ...toTrackSearch(state) }))).toEqual(state);
  });

  it('asks the API for the state, with the cursor of the next page', () => {
    expect(tracksUrl({ q: ' tele ', filter: 'missing', sort: 'title', dir: 'asc' }, null)).toBe(
      '/api/library/tracks?filter=missing&sort=title&dir=asc&q=tele',
    );
    expect(tracksUrl({ q: '', filter: 'all', sort: 'added', dir: 'desc' }, 'abc')).toBe(
      '/api/library/tracks?filter=all&sort=added&dir=desc&cursor=abc',
    );
  });
});

describe('the Tracks columns', () => {
  it('sorts by every column but # and Status, Length right-aligned', () => {
    expect(TRACK_COLUMNS.map((column) => column.label)).toEqual([
      '#',
      'Title',
      'Artist',
      'Album',
      'Length',
      'Added',
      'Status',
    ]);
    expect(TRACK_SORT_PILLS.map((pill) => pill.label)).toEqual([
      'Title',
      'Artist',
      'Album',
      'Length',
      'Added',
    ]);
    expect(TRACK_COLUMNS.find((column) => column.label === 'Length')?.align).toBe('right');
  });

  it('labels the status: on disk green, missing red, the rest muted', () => {
    expect(trackStatus('on_disk')).toEqual({ label: 'on disk', tone: 'ok' });
    expect(trackStatus('missing')).toEqual({ label: 'missing', tone: 'red' });
    expect(trackStatus('wanted')).toEqual({ label: 'wanted', tone: 'muted' });
    expect(trackStatus('downloading')).toEqual({ label: 'downloading', tone: 'muted' });
  });
});
