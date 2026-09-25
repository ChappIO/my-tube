import type { AlbumDetail, HomeItem, TrackListItem } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import {
  albumQueue,
  artistQueue,
  homeQueue,
  playlistQueue,
  trackItem,
  tracksTableQueue,
} from './queues';

const NOW = '2026-09-25T10:00:00.000Z';

function track(id: number, extra: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    sourceId: 1,
    youtubeId: `yt-${id}`,
    title: `Track ${id}`,
    durationSeconds: 180 + id,
    publishedAt: null,
    thumbnailUrl: null,
    status: 'on_disk',
    skipReason: null,
    filePath: `Artist/Album/${id}.m4a`,
    fileSizeBytes: 10,
    downloadedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    albumId: 7,
    artistId: 3,
    trackNumber: id,
    discNumber: null,
    coverUrl: '/api/artwork/album/7',
    mimeType: 'audio/mp4',
    artist: { id: 3, name: 'Hiatus Kaiyote', avatarUrl: null, sourceId: 1 },
    album: { id: 7, title: 'Mood Valiant', year: 2021, coverUrl: '/api/artwork/album/7' },
    ...extra,
  };
}

const missing = (id: number) => track(id, { status: 'missing', filePath: null, mimeType: null });

function album(tracks: TrackListItem[]): AlbumDetail {
  return {
    album: {
      id: 7,
      title: 'Mood Valiant',
      year: 2021,
      coverUrl: '/api/artwork/album/7',
      youtubeId: null,
      youtubeUrl: null,
      pinned: false,
    },
    artist: {
      id: 3,
      name: 'Hiatus Kaiyote',
      avatarUrl: null,
      sourceId: 1,
      subscribed: true,
      albumCount: 1,
      trackCount: tracks.length,
    },
    tracks,
    trackCount: tracks.length,
    onDiskCount: tracks.filter((entry) => entry.status === 'on_disk').length,
    wantedCount: 0,
    missingCount: 0,
    queuedCount: 0,
    totalDurationSeconds: 0,
    sizeBytes: 0,
    container: 'm4a',
  };
}

const ids = (start: { items: { id: number }[] } | null) => start?.items.map((entry) => entry.id);

describe('trackItem', () => {
  it('maps a track to a music queue item', () => {
    expect(trackItem(track(1))).toEqual({
      kind: 'music',
      id: 1,
      title: 'Track 1',
      sub: 'Hiatus Kaiyote',
      album: 'Mood Valiant',
      albumId: 7,
      dur: 181,
      artUrl: '/api/artwork/album/7',
      fileUrl: '/api/library/tracks/1/stream',
    });
  });

  it('marks a track not on disk and copes without album or length', () => {
    const item = trackItem(track(2, { status: 'wanted', album: null, durationSeconds: null }));
    expect(item).toMatchObject({ missing: true, dur: 0 });
    expect('album' in item).toBe(false);
  });
});

describe('albumQueue', () => {
  const detail = album([track(1), missing(2), track(3), track(4)]);

  it('plays the tracks on disk from the first; missing ones are skipped', () => {
    expect(albumQueue(detail)).toMatchObject({ index: 0, from: 'Mood Valiant' });
    expect(ids(albumQueue(detail))).toEqual([1, 3, 4]);
  });

  it('starts at the clicked row', () => {
    expect(albumQueue(detail, 3)?.index).toBe(1);
  });

  it('is null for a row not on disk or an album with nothing on disk', () => {
    expect(albumQueue(detail, 2)).toBeNull();
    expect(albumQueue(album([missing(1)]))).toBeNull();
  });
});

describe('tracksTableQueue', () => {
  it('keeps the table order and continues down from the clicked row', () => {
    const rows = [track(9), missing(4), track(2), track(7)];
    const start = tracksTableQueue(rows, 2);
    expect(ids(start)).toEqual([9, 2, 7]);
    expect(start).toMatchObject({ index: 1, from: 'Tracks' });
  });
});

describe('artistQueue and playlistQueue', () => {
  it('label the queue with the artist and the playlist', () => {
    expect(artistQueue([track(1), track(2)], 'Hiatus Kaiyote')).toMatchObject({
      index: 0,
      from: 'Hiatus Kaiyote',
    });
    expect(playlistQueue([track(5)], 'Road Trip')).toMatchObject({ from: 'Road Trip' });
    expect(playlistQueue([], 'Empty')).toBeNull();
  });
});

describe('homeQueue', () => {
  it('queues the music of the day group in the order shown, videos left out', () => {
    const video = { kind: 'video', id: 40 } as unknown as HomeItem;
    const group: HomeItem[] = [
      { ...track(1), kind: 'music' },
      video,
      { ...track(2), kind: 'music' },
    ];
    const start = homeQueue(group, 2);
    expect(ids(start)).toEqual([1, 2]);
    expect(start).toMatchObject({ index: 1, from: 'Home' });
  });
});
