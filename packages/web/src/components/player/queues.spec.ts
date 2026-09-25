import type { AlbumDetail, HomeItem, TrackListItem, VideoListItem } from '@mytube/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playerState, resetPlayer, setNowOpen } from '../../player-state';
import {
  albumQueue,
  artistQueue,
  homeQueue,
  homeVideoQueue,
  addToQueue,
  playlistQueue,
  setNowPlayingOpener,
  singleVideo,
  startQueue,
  trackItem,
  tracksTableQueue,
  videoItem,
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

  it('a row click plays that track alone', () => {
    const start = albumQueue(detail, 3);
    expect(ids(start)).toEqual([3]);
    expect(start).toMatchObject({ index: 0, from: 'Mood Valiant' });
  });

  it('is null for a row not on disk or an album with nothing on disk', () => {
    expect(albumQueue(detail, 2)).toBeNull();
    expect(albumQueue(album([missing(1)]))).toBeNull();
  });
});

describe('tracksTableQueue', () => {
  it('plays the clicked row alone, labelled with its album or "Tracks"', () => {
    const rows = [track(9), missing(4), track(2, { album: null }), track(7)];
    const start = tracksTableQueue(rows, 7);
    expect(ids(start)).toEqual([7]);
    expect(start).toMatchObject({ index: 0, from: 'Mood Valiant' });
    expect(tracksTableQueue(rows, 2)).toMatchObject({ from: 'Tracks' });
    expect(tracksTableQueue(rows, 4)).toBeNull();
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
  it('plays the clicked tile alone, labelled with its album or "Home"', () => {
    const video = { kind: 'video', id: 40 } as unknown as HomeItem;
    const group: HomeItem[] = [
      { ...track(1), kind: 'music' },
      video,
      { ...track(2), kind: 'music' },
    ];
    const start = homeQueue(group, 2);
    expect(ids(start)).toEqual([2]);
    expect(start).toMatchObject({ index: 0, from: 'Mood Valiant' });
    const single: HomeItem[] = [{ ...track(3, { album: null }), kind: 'music' }];
    expect(homeQueue(single, 3)).toMatchObject({ from: 'Home' });
  });
});

const CLOCK = Date.parse('2026-09-25T12:00:00Z');
const NASA = { id: 2, name: 'NASA', avatarUrl: null, sourceId: 5 };
const ESA = { id: 3, name: 'ESA', avatarUrl: null, sourceId: null };

function videoRow(
  id: number,
  channel: VideoListItem['channel'] = NASA,
  extra: Partial<VideoListItem> = {},
): VideoListItem {
  return {
    id,
    sourceId: channel.sourceId,
    youtubeId: `yt-${id}`,
    title: `Video ${id}`,
    durationSeconds: 60 * id,
    publishedAt: '2026-09-23',
    thumbnailUrl: `/api/artwork/video/${id}`,
    status: 'on_disk',
    skipReason: null,
    filePath: `${channel.name}/Video ${id}.mkv`,
    fileSizeBytes: 10,
    downloadedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    channelId: channel.id,
    isShort: false,
    liveStatus: null,
    mimeType: 'video/x-matroska',
    channel,
    ...extra,
  };
}

const videoIds = (start: ReturnType<typeof singleVideo>) => start?.items.map((item) => item.id);

describe('videoItem', () => {
  it('maps a video: the channel as sub, the relative date, the play URL and the container', () => {
    expect(videoItem(videoRow(4), CLOCK)).toEqual({
      kind: 'video',
      id: 4,
      title: 'Video 4',
      sub: 'NASA',
      when: '2 days ago',
      dur: 240,
      artUrl: '/api/artwork/video/4',
      fileUrl: '/api/library/videos/4/play',
      channelPageId: 5,
      container: 'mkv',
    });
    const plain = videoItem(
      videoRow(5, ESA, { durationSeconds: null, publishedAt: null, filePath: 'ESA/x.MP4' }),
      CLOCK,
    );
    expect(plain).toMatchObject({ dur: 0, container: 'mp4' });
    expect(plain.when).toBeUndefined();
    expect(plain.channelPageId).toBeUndefined();
  });
});

describe('video clicks', () => {
  it('Home: the clicked video alone, from its channel', () => {
    const group: HomeItem[] = [
      { ...videoRow(1), kind: 'video' },
      { ...track(9), kind: 'music' },
      { ...videoRow(2, ESA), kind: 'video' },
      { ...videoRow(3), kind: 'video' },
    ];
    const start = homeVideoQueue(group, 3, CLOCK);
    expect(videoIds(start)).toEqual([3]);
    expect(start).toMatchObject({ index: 0, from: 'NASA' });
    expect(homeVideoQueue(group, 2, CLOCK)).toMatchObject({ from: 'ESA' });
    expect(homeVideoQueue(group, 9, CLOCK)).toBeNull();
    expect(homeVideoQueue(group, 99, CLOCK)).toBeNull();
  });

  it('Videos tab and channel page: the clicked video alone, never its channel; nothing not on disk', () => {
    const list = [
      videoRow(1),
      videoRow(2, ESA),
      videoRow(3),
      videoRow(4, NASA, { status: 'missing' }),
    ];
    const start = singleVideo(list, 3, CLOCK);
    expect(videoIds(start)).toEqual([3]);
    expect(start).toMatchObject({ index: 0, from: 'NASA' });
    expect(singleVideo(list, 2, CLOCK)).toMatchObject({ from: 'ESA' });
    expect(singleVideo(list, 4, CLOCK)).toBeNull();
    expect(singleVideo(list, 99, CLOCK)).toBeNull();
  });
});

describe('a one-item queue opens Now Playing', () => {
  // The route push mounts Now Playing, which sets nowOpen.
  const open = vi.fn<() => void>(() => setNowOpen(true));

  beforeEach(() => {
    open.mockClear();
    setNowPlayingOpener(open);
  });

  afterEach(() => {
    setNowPlayingOpener(null);
    resetPlayer();
  });

  it('opens it for one track (a clicked track, or a playlist with one on disk)', () => {
    startQueue(tracksTableQueue([track(1), track(2)], 2));
    expect(open).toHaveBeenCalledTimes(1);
    expect(playerState().player).toMatchObject({ from: 'Mood Valiant' });
    resetPlayer();
    open.mockClear();
    startQueue(playlistQueue([track(1), track(2, { status: 'missing' })], 'Road Trip'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(playerState()).toMatchObject({ nowOpen: true, cardOpen: false });
    expect(playerState().player).toMatchObject({ kind: 'music', from: 'Road Trip' });
  });

  it('opens it for every video click (a video never forms a queue)', () => {
    startQueue(singleVideo([videoRow(1), videoRow(2), videoRow(3)], 2, CLOCK));
    expect(open).toHaveBeenCalledTimes(1);
    expect(playerState()).toMatchObject({ nowOpen: true, cardOpen: false });
    expect(playerState().player).toMatchObject({ kind: 'video', from: 'NASA', index: 0 });
    expect(playerState().player?.queue.map((item) => item.id)).toEqual([2]);
  });

  it('keeps the bar and the card for two or more items, and does nothing without a queue', () => {
    startQueue(artistQueue([track(1), track(2)], 'Hiatus Kaiyote'));
    startQueue(null);
    expect(open).not.toHaveBeenCalled();
    expect(playerState()).toMatchObject({ nowOpen: false, cardOpen: true });
  });

  it('"+" opens it when it starts a new one-item queue, never when it appends', () => {
    addToQueue(trackItem(track(1)));
    expect(open).toHaveBeenCalledTimes(1);
    setNowOpen(false);
    addToQueue(trackItem(track(2)));
    expect(open).toHaveBeenCalledTimes(1);
    expect(playerState().player?.queue).toHaveLength(2);
  });

  it('"+" on music while a video plays starts a new queue and opens it; a missing track does not', () => {
    startQueue(singleVideo([videoRow(1), videoRow(2)], 1, CLOCK));
    open.mockClear();
    addToQueue(trackItem(track(3)));
    expect(open).toHaveBeenCalledTimes(1);
    resetPlayer();
    addToQueue(trackItem(track(4, { status: 'missing' })));
    expect(open).toHaveBeenCalledTimes(1);
    expect(playerState().player).toBeNull();
  });
});
