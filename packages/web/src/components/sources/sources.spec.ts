import {
  DEFAULT_SOURCE_OPTIONS,
  DEFAULT_VIDEO_MATCHER,
  type ResolvedSource,
  type Source,
} from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { kindInLibrary, resolvedMeta, sourceMeta, videoLibrarySummary } from './source-text';

const source: Source = {
  id: 1,
  library: 'video',
  kind: 'channel',
  youtubeId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
  url: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ',
  name: 'NASA',
  avatarUrl: null,
  subscribed: true,
  matcher: DEFAULT_VIDEO_MATCHER,
  options: DEFAULT_SOURCE_OPTIONS,
  lastCheckedAt: null,
  itemCount: 0,
  sizeBytes: 0,
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const resolved: ResolvedSource = {
  kind: 'channel',
  library: 'video',
  youtubeId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
  url: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ',
  name: 'NASA',
  avatarUrl: null,
  itemCount: null,
  uploadsPerWeek: 3.24,
  latestItemAt: null,
  resolvedFrom: null,
  alreadyAdded: null,
};

describe('source text', () => {
  it('writes the row meta, leaving out counts that are still 0', () => {
    expect(sourceMeta(source)).toBe('Channel');
    expect(sourceMeta({ ...source, itemCount: 214, sizeBytes: 38e9 })).toBe(
      'Channel · 214 videos · 38 GB',
    );
    expect(sourceMeta({ ...source, kind: 'playlist', itemCount: 1 })).toBe('Playlist · 1 video');
    expect(sourceMeta({ ...source, library: 'music', kind: 'artist', itemCount: 12 })).toBe(
      'Artist · 12 tracks',
    );
  });

  it('writes the source card meta for the chosen library', () => {
    expect(resolvedMeta(resolved, 'video')).toBe('channel · 3.2 uploads/week');
    expect(resolvedMeta({ ...resolved, uploadsPerWeek: null }, 'video')).toBe(
      'channel · 0 uploads/week',
    );
    expect(resolvedMeta(resolved, 'music')).toBe('artist');
    const playlist = { ...resolved, kind: 'playlist' as const, itemCount: 9 };
    expect(resolvedMeta(playlist, 'video')).toBe('playlist · 9 videos');
    expect(resolvedMeta(playlist, 'music')).toBe('playlist · 9 tracks');
  });

  it('maps kinds to the library like the API', () => {
    expect(kindInLibrary('channel', 'music')).toBe('artist');
    expect(kindInLibrary('artist', 'video')).toBe('channel');
    expect(kindInLibrary('playlist', 'music')).toBe('playlist');
  });

  it('summarises the video library', () => {
    expect(videoLibrarySummary([])).toBe('0 channels');
    expect(
      videoLibrarySummary([
        { ...source, itemCount: 200, sizeBytes: 100e9 },
        { ...source, id: 2 },
        { ...source, id: 3, kind: 'playlist', itemCount: 168, sizeBytes: 30.4e9 },
      ]),
    ).toBe('2 channels · 1 playlist · 368 videos · 130 GB');
  });
});
