import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_VIDEO_MATCHER,
  and,
  evaluateMatcher,
  not,
} from './matchers.js';
import {
  DEFAULT_SOURCE_OPTIONS,
  LIVE_WORD_PATTERN,
  Source,
  SourceOptions,
  convertLegacyRules,
  describeOptions,
  describeSource,
  sourceIssues,
} from './rules.js';

const baseSource = {
  id: 1,
  library: 'video',
  kind: 'channel',
  youtubeId: 'UCabc',
  url: 'https://www.youtube.com/@abc',
  name: 'Abc',
  avatarUrl: null,
  subscribed: true,
  matcher: DEFAULT_VIDEO_MATCHER,
  options: DEFAULT_SOURCE_OPTIONS,
  lastCheckedAt: null,
  itemCount: 0,
  sizeBytes: 0,
  createdAt: '2026-09-24T19:35:10.000Z',
  updatedAt: '2026-09-24T19:35:10.000Z',
};

describe('SourceOptions', () => {
  it('fills defaults and strips unknown fields', () => {
    expect(SourceOptions.parse({ extra: 1 })).toEqual({ embedCoverArt: true, syncOrder: false });
  });

  it('describes options as chips', () => {
    expect(describeOptions({ embedCoverArt: true, syncOrder: true }, 'video')).toEqual([
      'sync order',
    ]);
    expect(describeOptions({ embedCoverArt: true, syncOrder: false }, 'music')).toEqual([
      'cover art',
    ]);
    expect(describeOptions({ embedCoverArt: false, syncOrder: false }, 'music')).toEqual([]);
  });

  it('puts rule chips before option chips', () => {
    expect(
      describeSource({
        library: 'video',
        matcher: DEFAULT_VIDEO_MATCHER,
        options: { embedCoverArt: true, syncOrder: true },
      }),
    ).toEqual(['no shorts', 'not older than 90 days', 'not members only', 'sync order']);
  });
});

describe('Source', () => {
  it('accepts a valid row and strips the legacy rules column', () => {
    expect(Source.parse({ ...baseSource, rules: { library: 'video' } })).toEqual(baseSource);
  });

  it('accepts playlist-only conditions and sync order on a playlist', () => {
    expect(
      Source.safeParse({
        ...baseSource,
        kind: 'playlist',
        matcher: and({ type: 'channel_is', channel: 'NASA' }),
        options: { embedCoverArt: true, syncOrder: true },
      }).success,
    ).toBe(true);
  });

  it('rejects an artist in the Video library', () => {
    const result = Source.safeParse({ ...baseSource, kind: 'artist' });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['kind']]);
  });

  it('rejects sync order and playlist-only conditions outside playlists', () => {
    expect(
      sourceIssues({
        library: 'video',
        kind: 'channel',
        matcher: not({ type: 'in_playlist_position_under', position: 5 }),
        options: { syncOrder: true },
      }),
    ).toEqual([
      { path: ['options', 'syncOrder'], message: 'Sync order only applies to playlists' },
      {
        path: ['matcher'],
        message: 'The playlist position condition only applies to playlists',
      },
    ]);
    expect(
      sourceIssues({
        library: 'music',
        kind: 'artist',
        matcher: and({ type: 'channel_is', channel: 'x' }),
      }),
    ).toEqual([{ path: ['matcher'], message: 'The channel condition only applies to playlists' }]);
  });

  it('rejects invalid matchers, timestamps and counts', () => {
    expect(Source.safeParse({ ...baseSource, matcher: { type: 'and' } }).success).toBe(false);
    expect(Source.safeParse({ ...baseSource, lastCheckedAt: '2026-09-24 19:35:10' }).success).toBe(
      false,
    );
    expect(Source.safeParse({ ...baseSource, sizeBytes: -1 }).success).toBe(false);
  });
});

describe('convertLegacyRules', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('maps the old video defaults to what they meant (no members-only condition then)', () => {
    expect(convertLegacyRules({ library: 'video' })).toEqual({
      matcher: and(not({ type: 'is_short' }), not({ type: 'older_than_days', days: 90 })),
      options: { embedCoverArt: true, syncOrder: false },
    });
  });

  it('maps the old music defaults to the new music default', () => {
    expect(convertLegacyRules({ library: 'music' })).toEqual({
      matcher: DEFAULT_MUSIC_MATCHER,
      options: { embedCoverArt: true, syncOrder: false },
    });
  });

  it('maps every video rule, in order', () => {
    expect(
      convertLegacyRules({
        library: 'video',
        skipShorts: true,
        keepDays: 30,
        publishedAfter: '2025-01-01',
        titleFilter: ' Monologue ',
        syncOrder: true,
      }),
    ).toEqual({
      matcher: and(
        not({ type: 'is_short' }),
        not({ type: 'older_than_days', days: 30 }),
        { type: 'published_after', date: '2025-01-01' },
        { type: 'title_contains', text: 'Monologue' },
      ),
      options: { embedCoverArt: true, syncOrder: true },
    });
  });

  it.each([
    [{ skipShorts: false, keepDays: null }, and()],
    [{ skipShorts: true, keepDays: null }, and(not({ type: 'is_short' }))],
    [{ skipShorts: false, keepDays: 7 }, and(not({ type: 'older_than_days', days: 7 }))],
    [
      { skipShorts: false, keepDays: null, publishedAfter: '2024-02-29' },
      and({ type: 'published_after', date: '2024-02-29' }),
    ],
    [
      { skipShorts: false, keepDays: null, titleFilter: 'Deep Dive' },
      and({ type: 'title_contains', text: 'Deep Dive' }),
    ],
  ])('maps video %j', (fields, matcher) => {
    expect(convertLegacyRules({ library: 'video', ...fields }).matcher).toEqual(matcher);
  });

  it('maps skip live recordings to a word regex and cover art to an option', () => {
    const converted = convertLegacyRules({
      library: 'music',
      skipLiveRecordings: true,
      embedCoverArt: false,
    });
    expect(converted).toEqual({
      matcher: and(not({ type: 'title_matches', pattern: LIVE_WORD_PATTERN })),
      options: { embedCoverArt: false, syncOrder: false },
    });
    const title = (value: string) =>
      evaluateMatcher(converted.matcher, {
        title: value,
        isShort: false,
        publishedAt: null,
        durationSeconds: null,
        liveStatus: null,
        availability: null,
        channelName: null,
        channelId: null,
        playlistPosition: null,
        now,
      }).matches;
    expect(title('Song (Live)')).toBe(false);
    expect(title('Live at Wembley')).toBe(false);
    expect(title('Olive Tree')).toBe(true);
  });

  it('ignores stripped fields of the other library and rejects invalid rules', () => {
    expect(convertLegacyRules({ library: 'music', skipShorts: true }).matcher).toEqual(and());
    expect(() => convertLegacyRules({ library: 'video', keepDays: 0 })).toThrow();
    expect(() => convertLegacyRules({ library: 'podcast' })).toThrow();
  });
});
