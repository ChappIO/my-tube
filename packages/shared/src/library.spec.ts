import { describe, expect, it } from 'vitest';
import { ArtworkPath, ImageUrl, artworkPath } from './artwork.js';
import { HomeQuery, VideoListQuery, videoMimeType } from './library.js';

describe('artwork paths', () => {
  it('builds and validates cache paths', () => {
    expect(artworkPath('channel', 3)).toBe('/api/artwork/channel/3');
    expect(ArtworkPath.safeParse('/api/artwork/video/12').success).toBe(true);
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
