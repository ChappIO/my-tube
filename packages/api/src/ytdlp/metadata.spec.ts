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

  it('sums the selected streams into expectedBytes', () => {
    // The fixture was fetched with a format selector: video (exact) plus audio (estimated).
    const source = parseSourceMetadata(fixture('video.json'));
    expect(source.entries[0]?.expectedStreams).toEqual([
      { formatId: '248', bytes: 2_400_000 },
      { formatId: '251', bytes: 600_000 },
    ]);
    expect(source.entries[0]?.expectedBytes).toBe(2_400_000 + 600_000);

    const video = { _type: 'video', id: 'v1', title: 'One', duration: 1180 };
    const bytes = (info: object) => parseSourceMetadata({ ...video, ...info }).entries[0];
    // A single file: exact size first, then the estimate.
    expect(bytes({ filesize: 5000, filesize_approx: 6000 })?.expectedBytes).toBe(5000);
    expect(bytes({ filesize: null, filesize_approx: 6000.4 })?.expectedBytes).toBe(6000);
    // A merged download: the requested streams win over the top-level size.
    expect(
      bytes({
        filesize_approx: 1,
        requested_formats: [{ filesize: 900 }, { filesize: null, filesize_approx: 100 }],
      })?.expectedBytes,
    ).toBe(1000);
    // An HLS stream has no size, only a bitrate (kbit/s): bitrate × duration stands in.
    expect(
      bytes({
        requested_formats: [
          { format_id: '616', filesize: null, filesize_approx: null, tbr: 3508.025 },
          { format_id: '140', filesize: 19_105_583, tbr: 129.476 },
        ],
      })?.expectedStreams,
    ).toEqual([
      { formatId: '616', bytes: 517_433_688 },
      { formatId: '140', bytes: 19_105_583 },
    ]);
    // One stream of unknown size makes the whole unknown.
    const partly = bytes({ requested_formats: [{ filesize: 900 }, { format_id: '140' }] });
    expect(partly?.expectedStreams).toEqual([
      { formatId: null, bytes: 900 },
      { formatId: '140', bytes: null },
    ]);
    expect(partly?.expectedBytes).toBeNull();
    expect(bytes({})).toMatchObject({ expectedStreams: [], expectedBytes: null });
    expect(bytes({ format_id: '18', filesize: 5000 })?.expectedStreams).toEqual([
      { formatId: '18', bytes: 5000 },
    ]);
    // Flat listing entries carry no sizes.
    const channel = parseSourceMetadata(fixture('channel.json'));
    expect(channel.entries.every((entry) => entry.expectedBytes === null)).toBe(true);
  });

  it("reads the members-only badge from a flat entry's availability", () => {
    // Trimmed from yt-dlp 2026.08.19 on https://www.youtube.com/@MengusWorkshop/videos: flat
    // entries carry `availability: subscriber_only` for members-only videos and null otherwise.
    const source = parseSourceMetadata({
      _type: 'playlist',
      id: 'UCGZdKNOxKdSNL1Qht9aC8tQ',
      channel_id: 'UCGZdKNOxKdSNL1Qht9aC8tQ',
      channel: "Mengu's Workshop",
      webpage_url: 'https://www.youtube.com/@MengusWorkshop/videos',
      entries: [
        {
          _type: 'url',
          ie_key: 'Youtube',
          id: 'Qa2iPP35WK8',
          url: 'https://www.youtube.com/watch?v=Qa2iPP35WK8',
          title: "What's the BEST Enchantment Deck in Premodern?",
          duration: 2527,
          timestamp: 1790121600,
          live_status: null,
          availability: null,
        },
        {
          _type: 'url',
          ie_key: 'Youtube',
          id: 'Ar6PspVnJxc',
          url: 'https://www.youtube.com/watch?v=Ar6PspVnJxc',
          title: 'Enchantress vs Replenish! | Premodern Warm Up Match!',
          duration: 1616,
          timestamp: 1790035200,
          live_status: null,
          availability: 'subscriber_only',
        },
        { _type: 'url', id: 'odd', url: 'https://www.youtube.com/watch?v=odd', availability: 7 },
      ],
    });
    expect(source.entries.map((entry) => [entry.id, entry.availability])).toEqual([
      ['Qa2iPP35WK8', null],
      ['Ar6PspVnJxc', 'subscriber_only'],
      ['odd', null],
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
