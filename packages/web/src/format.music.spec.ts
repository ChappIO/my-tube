import { describe, expect, it } from 'vitest';
import {
  albumMeta,
  artistMeta,
  formatTotalLength,
  musicLibrarySummary,
  playlistMeta,
} from './format';

describe('music formatting', () => {
  it('writes album meta lines, red when tracks are missing', () => {
    expect(albumMeta({ year: 2007, trackCount: 10, onDiskCount: 10 })).toEqual({
      text: '2007 · 10 tracks',
      incomplete: false,
    });
    expect(albumMeta({ year: 2019, trackCount: 14, onDiskCount: 12 })).toEqual({
      text: '12/14 tracks',
      incomplete: true,
    });
    expect(albumMeta({ year: null, trackCount: 1, onDiskCount: 1 }).text).toBe('1 track');
    expect(albumMeta({ year: 2024, trackCount: 3, onDiskCount: 0 }).text).toBe('0/3 tracks');
  });

  it('writes artist meta lines', () => {
    expect(artistMeta({ albumCount: 9, trackCount: 112 })).toBe('9 albums · 112 tracks');
    expect(artistMeta({ albumCount: 1, trackCount: 1 })).toBe('1 album · 1 track');
    expect(artistMeta({ albumCount: 0, trackCount: 1204 })).toBe('0 albums · 1,204 tracks');
  });

  it('writes playlist meta lines with the total length', () => {
    expect(playlistMeta({ trackCount: 42, onDiskCount: 42, durationSeconds: 10_260 })).toEqual({
      text: '42 tracks · 2h51',
      incomplete: false,
    });
    expect(playlistMeta({ trackCount: 68, onDiskCount: 65, durationSeconds: 15_120 })).toEqual({
      text: '65/68 tracks · 4h12',
      incomplete: true,
    });
    expect(formatTotalLength(0)).toBe('0 min');
    expect(formatTotalLength(2_520)).toBe('42 min');
    expect(formatTotalLength(3_600)).toBe('1h00');
  });

  it('writes the Music header sub line', () => {
    expect(
      musicLibrarySummary({ artists: 31, albums: 84, playlists: 3, artistSubscriptions: 4 }),
    ).toBe('31 artists · 84 albums · 3 playlists · 4 artist subscriptions');
    expect(
      musicLibrarySummary({ artists: 1, albums: 1, playlists: 0, artistSubscriptions: 1 }),
    ).toBe('1 artist · 1 album · 0 playlists · 1 artist subscription');
  });
});
