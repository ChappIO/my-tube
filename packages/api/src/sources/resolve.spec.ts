import { readFileSync } from 'node:fs';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_SETTINGS,
  DEFAULT_VIDEO_MATCHER,
  and,
} from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { parseSourceMetadata, type SourceEntry } from '../ytdlp/metadata.js';
import {
  cadence,
  canonicalSourceUrl,
  imageUrl,
  initialRules,
  kindForLibrary,
  mergeOptions,
} from './resolve.js';

const fixture = (name: string) =>
  parseSourceMetadata(
    JSON.parse(readFileSync(new URL(`../../test/fixtures/ytdlp/${name}`, import.meta.url), 'utf8')),
  );

const UC = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const DAY = 86_400;

function entry(overrides: Partial<SourceEntry>): SourceEntry {
  return {
    kind: 'video',
    id: 'x',
    title: null,
    url: 'https://www.youtube.com/watch?v=x',
    duration: null,
    uploadDate: null,
    timestamp: null,
    liveStatus: null,
    isShort: false,
    tab: null,
    channelId: null,
    channel: null,
    thumbnails: [],
    ...overrides,
  };
}

describe('kindForLibrary', () => {
  it('maps channels and artists to the library and keeps playlists', () => {
    expect(kindForLibrary('channel', 'music')).toBe('artist');
    expect(kindForLibrary('artist', 'video')).toBe('channel');
    expect(kindForLibrary('channel', 'video')).toBe('channel');
    expect(kindForLibrary('playlist', 'music')).toBe('playlist');
  });
});

describe('canonicalSourceUrl', () => {
  it('builds id-based URLs', () => {
    expect(canonicalSourceUrl('channel', UC, false)).toBe(`https://www.youtube.com/channel/${UC}`);
    expect(canonicalSourceUrl('artist', UC, false)).toBe(`https://music.youtube.com/channel/${UC}`);
    expect(canonicalSourceUrl('playlist', 'PLabc', false)).toBe(
      'https://www.youtube.com/playlist?list=PLabc',
    );
    expect(canonicalSourceUrl('playlist', 'OLAK5uy_x', true)).toBe(
      'https://music.youtube.com/playlist?list=OLAK5uy_x',
    );
  });

  it('falls back to the handle when there is no channel id', () => {
    expect(canonicalSourceUrl('channel', '@NASA', false)).toBe('https://www.youtube.com/@NASA');
  });
});

describe('imageUrl', () => {
  it('keeps absolute URLs, fixes protocol-relative ones, drops junk', () => {
    expect(imageUrl('https://yt3.ggpht.com/a.jpg')).toBe('https://yt3.ggpht.com/a.jpg');
    expect(imageUrl('//yt3.ggpht.com/a.jpg')).toBe('https://yt3.ggpht.com/a.jpg');
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl('not a url')).toBeNull();
    expect(imageUrl('data:image/png;base64,xx')).toBeNull();
  });

  it('asks for a small avatar instead of the original upload', () => {
    expect(imageUrl('https://yt3.googleusercontent.com/abc=s0')).toBe(
      'https://yt3.googleusercontent.com/abc=s256',
    );
    expect(imageUrl('https://yt3.googleusercontent.com/abc=s900-c-k')).toBe(
      'https://yt3.googleusercontent.com/abc=s900-c-k',
    );
  });
});

describe('cadence', () => {
  it('uses the newest dated uploads across the channel tabs', () => {
    // Fixture: videos on 09-11, 09-11 and 09-04, a stream on 09-20 (approximate dates).
    const result = cadence(fixture('channel.json'));
    expect(result.latestItemAt).toBe('2026-09-20T00:00:00.000Z');
    // 3 intervals over 16 days.
    expect(result.uploadsPerWeek).toBe(1.3);
  });

  it('is null for playlists without dates', () => {
    expect(cadence(fixture('playlist.json'))).toEqual({ uploadsPerWeek: null, latestItemAt: null });
  });

  it('falls back to upload dates and skips upcoming streams and nested playlists', () => {
    const t0 = 1_788_000_000;
    const result = cadence({
      entries: [
        entry({ uploadDate: '2026-09-01' }),
        entry({ uploadDate: '2026-09-08' }),
        entry({ timestamp: t0 + 400 * DAY, liveStatus: 'is_upcoming' }),
        entry({ kind: 'playlist', timestamp: t0 + 500 * DAY }),
        entry({}),
      ],
    });
    expect(result).toEqual({ uploadsPerWeek: 1, latestItemAt: '2026-09-08T00:00:00.000Z' });
  });

  it('only looks at the newest 30 uploads', () => {
    const t0 = 1_788_000_000;
    const daily = Array.from({ length: 31 }, (_, i) => entry({ timestamp: t0 - i * DAY }));
    const old = Array.from({ length: 20 }, (_, i) => entry({ timestamp: t0 - (400 + i) * DAY }));
    expect(cadence({ entries: [...old, ...daily] }).uploadsPerWeek).toBe(7);
  });
});

describe('initialRules', () => {
  const tree = and({ type: 'title_contains', text: 'Deep Dive' });

  it('starts from the library default tree in Settings', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      video: { ...DEFAULT_SETTINGS.video, defaultRules: tree },
    };
    expect(initialRules('video', settings)).toEqual({
      matcher: tree,
      options: { embedCoverArt: true, syncOrder: false },
    });
    expect(initialRules('music', settings).matcher).toEqual(DEFAULT_MUSIC_MATCHER);
  });

  it('lets the client tree and options win', () => {
    expect(
      initialRules('video', DEFAULT_SETTINGS, { matcher: tree, options: { syncOrder: true } }),
    ).toEqual({ matcher: tree, options: { embedCoverArt: true, syncOrder: true } });
    expect(initialRules('video', DEFAULT_SETTINGS).matcher).toEqual(DEFAULT_VIDEO_MATCHER);
  });

  it('takes cover art for music sources from Settings → Music', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      music: { ...DEFAULT_SETTINGS.music, embedCoverArt: false },
    };
    expect(initialRules('music', settings).options.embedCoverArt).toBe(false);
    expect(initialRules('music', settings, { options: { embedCoverArt: true } }).options).toEqual({
      embedCoverArt: true,
      syncOrder: false,
    });
  });
});

describe('mergeOptions', () => {
  it('changes only the given fields', () => {
    const current = { embedCoverArt: false, syncOrder: true };
    expect(mergeOptions(current, { syncOrder: false })).toEqual({
      embedCoverArt: false,
      syncOrder: false,
    });
    expect(mergeOptions(current)).toEqual(current);
  });
});
