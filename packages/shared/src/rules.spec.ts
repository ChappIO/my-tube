import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_RULES,
  DEFAULT_VIDEO_RULES,
  Rules,
  Source,
  defaultRules,
  describeRules,
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
  rules: DEFAULT_VIDEO_RULES,
  lastCheckedAt: null,
  itemCount: 0,
  sizeBytes: 0,
  createdAt: '2026-09-24T19:35:10.000Z',
  updatedAt: '2026-09-24T19:35:10.000Z',
};

describe('Rules', () => {
  it('fills the handoff defaults per library', () => {
    expect(DEFAULT_VIDEO_RULES).toEqual({
      library: 'video',
      skipShorts: true,
      keepDays: 90,
      publishedAfter: null,
      titleFilter: null,
      syncOrder: false,
    });
    expect(DEFAULT_MUSIC_RULES).toEqual({
      library: 'music',
      skipLiveRecordings: false,
      embedCoverArt: true,
    });
    expect(defaultRules('video')).toEqual(DEFAULT_VIDEO_RULES);
    expect(defaultRules('music')).toEqual(DEFAULT_MUSIC_RULES);
    expect(defaultRules('video')).not.toBe(DEFAULT_VIDEO_RULES);
  });

  it('strips fields of the other library and unknown fields', () => {
    expect(Rules.parse({ library: 'music', skipShorts: false, extra: 1 })).toEqual(
      DEFAULT_MUSIC_RULES,
    );
  });

  it('trims the title filter', () => {
    expect(Rules.parse({ library: 'video', titleFilter: '  Deep Dive ' })).toMatchObject({
      titleFilter: 'Deep Dive',
    });
  });

  it('accepts a published-after date next to a keep window', () => {
    expect(
      Rules.parse({ library: 'video', publishedAfter: '2024-02-29', keepDays: 30 }),
    ).toMatchObject({ publishedAfter: '2024-02-29', keepDays: 30 });
  });

  it.each([
    { library: 'podcast' },
    { library: 'video', publishedAfter: '2025-02-30' },
    { library: 'video', publishedAfter: '2025-1-5' },
    { library: 'video', publishedAfter: '2025-01-05T00:00:00Z' },
    { library: 'video', publishedAfter: '' },
    {},
    { library: 'video', keepDays: 0 },
    { library: 'video', keepDays: 3651 },
    { library: 'video', keepDays: 1.5 },
    { library: 'video', titleFilter: '   ' },
    { library: 'video', titleFilter: 'x'.repeat(201) },
    { library: 'video', skipShorts: 'yes' },
    { library: 'music', embedCoverArt: null },
  ])('rejects %j', (input) => {
    expect(Rules.safeParse(input).success).toBe(false);
  });
});

describe('describeRules', () => {
  it('matches the handoff chips for a video source', () => {
    expect(
      describeRules({
        library: 'video',
        skipShorts: true,
        keepDays: 90,
        publishedAfter: '2025-01-01',
        titleFilter: 'Monologue',
        syncOrder: true,
      }),
    ).toEqual(['no shorts', 'keep 90 days', 'since 2025-01-01', 'only "Monologue"', 'sync order']);
  });

  it('omits rules that are off and uses the singular for one day', () => {
    expect(
      describeRules({
        library: 'video',
        skipShorts: false,
        keepDays: null,
        publishedAfter: null,
        titleFilter: null,
        syncOrder: false,
      }),
    ).toEqual([]);
    expect(describeRules({ ...DEFAULT_VIDEO_RULES, keepDays: 1 })).toEqual([
      'no shorts',
      'keep 1 day',
    ]);
  });

  it('describes music rules', () => {
    expect(describeRules(DEFAULT_MUSIC_RULES)).toEqual(['cover art']);
    expect(
      describeRules({
        library: 'music',
        skipLiveRecordings: true,
        embedCoverArt: false,
      }),
    ).toEqual(['no live']);
  });
});

describe('Source', () => {
  it('accepts a valid row', () => {
    expect(Source.parse(baseSource)).toEqual(baseSource);
  });

  it('accepts sync order on a playlist and an artist in Music', () => {
    expect(
      Source.safeParse({
        ...baseSource,
        kind: 'playlist',
        rules: { ...DEFAULT_VIDEO_RULES, syncOrder: true },
      }).success,
    ).toBe(true);
    expect(
      Source.safeParse({
        ...baseSource,
        library: 'music',
        kind: 'artist',
        rules: DEFAULT_MUSIC_RULES,
      }).success,
    ).toBe(true);
  });

  it('rejects rules of the other library', () => {
    const result = Source.safeParse({ ...baseSource, rules: DEFAULT_MUSIC_RULES });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['rules', 'library']]);
  });

  it('rejects an artist in the Video library', () => {
    const result = Source.safeParse({ ...baseSource, kind: 'artist' });
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['kind']]);
  });

  it('rejects sync order outside playlists', () => {
    expect(
      sourceIssues({
        library: 'video',
        kind: 'channel',
        rules: { ...DEFAULT_VIDEO_RULES, syncOrder: true },
      }),
    ).toEqual([{ path: ['rules', 'syncOrder'], message: 'Sync order only applies to playlists' }]);
  });

  it('rejects non-ISO timestamps and negative counts', () => {
    expect(Source.safeParse({ ...baseSource, lastCheckedAt: '2026-09-24 19:35:10' }).success).toBe(
      false,
    );
    expect(Source.safeParse({ ...baseSource, sizeBytes: -1 }).success).toBe(false);
  });
});
