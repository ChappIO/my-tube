import { describe, expect, it } from 'vitest';
import { ArtworkPath, ImageUrl, artworkPath } from './artwork.js';
import {
  AlbumListQuery,
  HomeItem,
  HomeQuery,
  PlaylistListQuery,
  VideoListQuery,
  audioMimeType,
  videoMimeType,
} from './library.js';

describe('artwork paths', () => {
  it('builds and validates cache paths', () => {
    expect(artworkPath('channel', 3)).toBe('/api/artwork/channel/3');
    expect(ArtworkPath.safeParse('/api/artwork/video/12').success).toBe(true);
    expect(ArtworkPath.safeParse('/api/artwork/album/3').success).toBe(true);
    expect(ArtworkPath.safeParse('/api/artwork/track/4').success).toBe(true);
    expect(ArtworkPath.safeParse('/api/artwork/video/0').success).toBe(false);
    expect(ArtworkPath.safeParse('/api/artwork/source/1').success).toBe(false);
    expect(ArtworkPath.safeParse('https://i.ytimg.com/vi/x/hq.jpg').success).toBe(false);
  });

  it('accepts cache paths and absolute URLs as image URLs', () => {
    expect(ImageUrl.safeParse('/api/artwork/playlist/1').success).toBe(true);
    expect(ImageUrl.safeParse('https://yt3.googleusercontent.com/a=s256').success).toBe(true);
    expect(ImageUrl.safeParse('/elsewhere.jpg').success).toBe(false);
  });
});

describe('library queries', () => {
  it('maps containers to content types', () => {
    expect(videoMimeType('NASA/What It Takes (2026-09-04).mkv')).toBe('video/x-matroska');
    expect(videoMimeType('a.MP4')).toBe('video/mp4');
    expect(videoMimeType('a.webm')).toBe('video/webm');
    expect(videoMimeType('a.avi')).toBeNull();
    expect(videoMimeType('noext')).toBeNull();
  });

  it('maps audio containers to content types', () => {
    expect(audioMimeType('Artist/Album/01 Title.m4a')).toBe('audio/mp4');
    expect(audioMimeType('a.MP3')).toBe('audio/mpeg');
    expect(audioMimeType('a.opus')).toBe('audio/ogg; codecs=opus');
    expect(audioMimeType('a.flac')).toBe('audio/flac');
    expect(audioMimeType('a.wav')).toBeNull();
  });

  it('validates the music list queries', () => {
    expect(AlbumListQuery.parse({ artistId: '3' })).toEqual({ artistId: 3 });
    expect(AlbumListQuery.safeParse({ artistId: '0' }).success).toBe(false);
    expect(PlaylistListQuery.parse({})).toEqual({ library: 'music' });
    expect(PlaylistListQuery.safeParse({ library: 'video' }).success).toBe(false);
  });

  it('tells Home items apart by kind', () => {
    const base = {
      id: 1,
      sourceId: null,
      youtubeId: 'x',
      title: 'Heatwave',
      durationSeconds: 201,
      publishedAt: '2024-04-05',
      thumbnailUrl: null,
      status: 'on_disk',
      skipReason: null,
      filePath: 'A/B/01 Heatwave.m4a',
      fileSizeBytes: 10,
      downloadedAt: '2026-09-25T10:00:00.000Z',
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    const music = HomeItem.parse({
      ...base,
      kind: 'music',
      albumId: null,
      artistId: 2,
      trackNumber: 1,
      discNumber: null,
      coverUrl: '/api/artwork/track/1',
      artist: { id: 2, name: 'Test Artist', avatarUrl: null, sourceId: null },
      album: null,
      mimeType: 'audio/mp4',
    });
    expect(music.kind).toBe('music');
    expect(HomeItem.safeParse({ ...base, kind: 'music' }).success).toBe(false);
  });

  it('defaults the videos list to on-disk, newest published, 60 per page', () => {
    expect(VideoListQuery.parse({})).toEqual({ status: 'on_disk', sort: 'published', limit: 60 });
    expect(VideoListQuery.parse({ channelId: '4', limit: '10' })).toMatchObject({
      channelId: 4,
      limit: 10,
    });
    expect(VideoListQuery.safeParse({ limit: '500' }).success).toBe(false);
    expect(VideoListQuery.safeParse({ status: 'missing' }).success).toBe(false);
  });

  it('validates the Home time zone', () => {
    expect(HomeQuery.parse({})).toEqual({ days: 14 });
    expect(HomeQuery.parse({ tz: 'Europe/Amsterdam' }).tz).toBe('Europe/Amsterdam');
    expect(HomeQuery.safeParse({ tz: 'Mars/Olympus' }).success).toBe(false);
  });
});
