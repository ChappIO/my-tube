import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSourceMetadata, RawInfo } from './metadata.js';

// Real yt-dlp 2026.08.19 output for NASA, trimmed (see test/fixtures/ytdlp).
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, '../../test/fixtures/ytdlp', name), 'utf8'),
  ) as unknown;

describe('parseSourceMetadata', () => {
  it('parses a channel root and flattens its tabs', () => {
    const source = parseSourceMetadata(fixture('channel.json'));
    expect(source).toMatchObject({
      kind: 'channel',
      id: 'UCLA_DiR1FfKNvjuUpBHmylQ',
      title: 'NASA',
      url: 'https://www.youtube.com/@NASA',
      channel: 'NASA',
      channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
      channelUrl: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ',
      uploaderUrl: 'https://www.youtube.com/@NASA',
      playlistCount: 3,
      skippedEntries: 0,
    });
    expect(source.thumbnailUrl).toContain('yt3.googleusercontent.com/eIf5');
    expect(source.entries).toHaveLength(9);
    expect(source.entries.map((e) => e.tab)).toEqual([
      ...Array<string>(3).fill('videos'),
      ...Array<string>(3).fill('streams'),
      ...Array<string>(3).fill('shorts'),
    ]);

    expect(source.entries[0]).toMatchObject({
      kind: 'video',
      id: 'IwZVXmQdX1E',
      title: 'NASA Moon Base: The First Six Months',
      url: 'https://www.youtube.com/watch?v=IwZVXmQdX1E',
      duration: 67,
      timestamp: 1789084800,
      uploadDate: '2026-09-11',
      liveStatus: null,
      isShort: false,
    });
    expect(source.entries[3]).toMatchObject({ liveStatus: 'is_live', duration: null });
    expect(source.entries[5]).toMatchObject({ liveStatus: 'was_live', uploadDate: '2026-09-20' });
    expect(source.entries.slice(6).every((e) => e.isShort && e.url.includes('/shorts/'))).toBe(
      true,
    );
  });

  it('parses a channel tab as a channel', () => {
    const tab = RawInfo.parse(fixture('channel.json')).entries?.[0];
    const source = parseSourceMetadata(tab);
    expect(source.kind).toBe('channel');
    expect(source.title).toBe('NASA');
    expect(source.entries).toHaveLength(3);
    expect(source.entries.every((e) => e.tab === 'videos' && !e.isShort)).toBe(true);
  });

  it('parses a playlist', () => {
    const source = parseSourceMetadata(fixture('playlist.json'));
    expect(source).toMatchObject({
      kind: 'playlist',
      id: 'PLB29CbKaE2OY',
      title: 'NASA Moon Base',
      url: 'https://www.youtube.com/playlist?list=PLB29CbKaE2OY',
      channel: 'NASA',
      channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
      playlistCount: 9,
    });
    expect(source.thumbnailUrl).toBe(source.thumbnails[1]?.url);
    expect(source.entries.map((e) => e.id)).toEqual([
      'tQcNSJc8gEg',
      'yIlTwwJv1Ac',
      'BYH6W9iCs2E',
      'LZea4h8zxLY',
    ]);
    expect(source.entries[1]).toMatchObject({
      duration: 7742,
      liveStatus: 'was_live',
      uploadDate: null,
      tab: null,
      channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
      channel: 'NASA',
    });
  });

  it('parses a single video as its own only entry', () => {
    const source = parseSourceMetadata(fixture('video.json'));
    expect(source).toMatchObject({ kind: 'video', id: '90Kgw_SvK4w', title: 'What It Takes' });
    expect(source.entries).toEqual([
      expect.objectContaining({
        kind: 'video',
        id: '90Kgw_SvK4w',
        duration: 152,
        uploadDate: '2026-09-04',
        liveStatus: 'not_live',
        isShort: false,
      }),
    ]);
  });

  it('drops invalid entries, ignores unknown fields and tolerates odd values', () => {
    const source = parseSourceMetadata({
      _type: 'playlist',
      id: 'PLx',
      title: 'Mixed',
      webpage_url: 'https://www.youtube.com/playlist?list=PLx',
      some_new_field: { nested: true },
      thumbnails: [{ url: 'a' }, { nope: 1 }],
      entries: [
        { _type: 'url', id: 'a1', url: 'https://www.youtube.com/shorts/a1', live_status: 'new' },
        null,
        { title: 'no id' },
        { _type: 'url', id: 'a1', url: 'https://www.youtube.com/shorts/a1' },
        {
          _type: 'url',
          ie_key: 'YoutubeTab',
          id: 'PLy',
          url: 'https://www.youtube.com/playlist?list=PLy',
        },
      ],
    });
    expect(source.skippedEntries).toBe(2);
    expect(source.thumbnails).toEqual([{ url: 'a' }]);
    expect(source.entries).toEqual([
      expect.objectContaining({ kind: 'video', id: 'a1', isShort: true, liveStatus: null }),
      expect.objectContaining({ kind: 'playlist', id: 'PLy', isShort: false }),
    ]);
  });

  it('throws when the top level is unusable', () => {
    expect(() => parseSourceMetadata({ title: 'no id' })).toThrow();
  });
});
