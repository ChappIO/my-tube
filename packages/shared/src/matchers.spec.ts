import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_VIDEO_MATCHER,
  MATCHER_MAX_DEPTH,
  MATCHER_MAX_NODES,
  Matcher,
  type MatcherContext,
  type MatcherLeaf,
  and,
  daysAgo,
  describeLeaf,
  describeMatcher,
  evaluateMatcher,
  formatDuration,
  matcherDepth,
  matcherSize,
  not,
  or,
  regexError,
} from './matchers.js';

const NOW = new Date('2026-09-24T12:00:00Z');

function ctx(overrides: Partial<MatcherContext> = {}): MatcherContext {
  return {
    title: 'Artemis II: What It Takes',
    isShort: false,
    publishedAt: '2026-09-20',
    durationSeconds: 600,
    liveStatus: null,
    availability: null,
    channelName: 'NASA',
    channelId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
    playlistPosition: null,
    now: NOW,
    ...overrides,
  };
}

const leaf = (value: MatcherLeaf) => value;
const matches = (matcher: Matcher, overrides: Partial<MatcherContext> = {}) =>
  evaluateMatcher(matcher, ctx(overrides)).matches;

describe('evaluateMatcher leaves', () => {
  it('title_contains is a case-insensitive plain substring', () => {
    const m = leaf({ type: 'title_contains', text: 'what it TAKES' });
    expect(matches(m)).toBe(true);
    expect(matches(m, { title: 'Orion' })).toBe(false);
    expect(matches(m, { title: null })).toBe(false);
    expect(matches({ type: 'title_contains', text: 'a.b' }, { title: 'axb' })).toBe(false);
  });

  it('title_matches is a case-insensitive regex', () => {
    const m = leaf({ type: 'title_matches', pattern: '\\blive\\b' });
    expect(matches(m, { title: 'Song (LIVE)' })).toBe(true);
    expect(matches(m, { title: 'Olive Tree' })).toBe(false);
    expect(matches(m, { title: null })).toBe(false);
    expect(matches({ type: 'title_matches', pattern: '([' }, { title: '([' })).toBe(false);
  });

  it('is_short', () => {
    expect(matches({ type: 'is_short' }, { isShort: true })).toBe(true);
    expect(matches({ type: 'is_short' }, { isShort: false })).toBe(false);
  });

  it('is_members_only reads yt-dlp availability; none is unknown', () => {
    const m = leaf({ type: 'is_members_only' });
    const artemis = leaf({ type: 'title_contains', text: 'Artemis' });
    expect(matches(m, { availability: 'subscriber_only' })).toBe(true);
    expect(matches(m, { availability: 'public' })).toBe(false);
    expect(matches(m, { availability: 'premium_only' })).toBe(false);
    expect(matches(not(m), { availability: 'subscriber_only' })).toBe(false);
    expect(matches(not(m), { availability: 'unlisted' })).toBe(true);
    // Flat listings only name the availability of badged entries: unknown counts as a match.
    expect(matches(m, { availability: null })).toBe(true);
    expect(matches(not(m), { availability: null })).toBe(true);
    expect(matches(or(m, artemis), { availability: null, title: 'Mars' })).toBe(true);
    expect(matches(and(m, artemis), { availability: null, title: 'Mars' })).toBe(false);
  });

  it('published_before is strict, published_after includes the day', () => {
    const before = leaf({ type: 'published_before', date: '2026-09-20' });
    const after = leaf({ type: 'published_after', date: '2026-09-20' });
    expect(matches(before, { publishedAt: '2026-09-19' })).toBe(true);
    expect(matches(before, { publishedAt: '2026-09-20' })).toBe(false);
    expect(matches(after, { publishedAt: '2026-09-20' })).toBe(true);
    expect(matches(after, { publishedAt: '2026-09-19' })).toBe(false);
    // ISO timestamps count by UTC day.
    expect(matches(after, { publishedAt: '2026-09-20T00:00:01Z' })).toBe(true);
    expect(matches(after, { publishedAt: '2026-09-19T23:59:59Z' })).toBe(false);
  });

  it('older_than_days compares UTC days and accepts the boundary day', () => {
    const m = leaf({ type: 'older_than_days', days: 30 });
    expect(daysAgo(NOW, 30)).toBe('2026-08-25');
    expect(matches(m, { publishedAt: '2026-08-24' })).toBe(true);
    expect(matches(m, { publishedAt: '2026-08-25' })).toBe(false);
    expect(matches(m, { publishedAt: '2026-09-24' })).toBe(false);
  });

  it('duration_under and duration_over are strict', () => {
    expect(matches({ type: 'duration_under', seconds: 60 }, { durationSeconds: 59 })).toBe(true);
    expect(matches({ type: 'duration_under', seconds: 60 }, { durationSeconds: 60 })).toBe(false);
    expect(matches({ type: 'duration_over', seconds: 60 }, { durationSeconds: 61 })).toBe(true);
    expect(matches({ type: 'duration_over', seconds: 60 }, { durationSeconds: 60 })).toBe(false);
  });

  it('live_status treats a missing status as not_live', () => {
    expect(matches({ type: 'live_status', status: 'was_live' }, { liveStatus: 'was_live' })).toBe(
      true,
    );
    expect(matches({ type: 'live_status', status: 'was_live' }, { liveStatus: null })).toBe(false);
    expect(matches({ type: 'live_status', status: 'not_live' }, { liveStatus: null })).toBe(true);
  });

  it('channel_is matches the id exactly or the name case-insensitively', () => {
    expect(matches({ type: 'channel_is', channel: 'nasa' })).toBe(true);
    expect(matches({ type: 'channel_is', channel: 'UCLA_DiR1FfKNvjuUpBHmylQ' })).toBe(true);
    expect(matches({ type: 'channel_is', channel: 'ESA' })).toBe(false);
  });

  it('in_playlist_position_under', () => {
    const m = leaf({ type: 'in_playlist_position_under', position: 4 });
    expect(matches(m, { playlistPosition: 3 })).toBe(true);
    expect(matches(m, { playlistPosition: 4 })).toBe(false);
  });
});

describe('evaluateMatcher gates', () => {
  const artemis = leaf({ type: 'title_contains', text: 'Artemis' });
  const orion = leaf({ type: 'title_contains', text: 'Orion' });

  it('treats an empty and as everything and an empty or as nothing', () => {
    expect(matches(and())).toBe(true);
    expect(matches(or())).toBe(false);
    expect(matches(not(and()))).toBe(false);
  });

  it('combines and, or and not', () => {
    const tree = and(not({ type: 'is_short' }), or(artemis, orion));
    expect(matches(tree)).toBe(true);
    expect(matches(tree, { title: 'Orion splashdown' })).toBe(true);
    expect(matches(tree, { title: 'Mars' })).toBe(false);
    expect(matches(tree, { isShort: true })).toBe(false);
  });

  it('nests deeply', () => {
    let tree: Matcher = artemis;
    for (let level = 1; level < MATCHER_MAX_DEPTH; level++) tree = not(not(tree));
    expect(matches(tree)).toBe(true);
    expect(matches(tree, { title: 'Mars' })).toBe(false);
  });

  it('counts unknown data as a match at the root, but lets known failures win', () => {
    const recent = not({ type: 'older_than_days', days: 90 });
    const since = leaf({ type: 'published_after', date: '2026-01-01' });
    expect(matches(recent, { publishedAt: null })).toBe(true);
    expect(matches(since, { publishedAt: null })).toBe(true);
    expect(matches(and(recent, artemis), { publishedAt: null, title: 'Mars' })).toBe(false);
    expect(matches(or(since, artemis), { publishedAt: null, title: 'Mars' })).toBe(true);
    expect(matches(or(since, artemis), { publishedAt: '2025-01-01', title: 'Mars' })).toBe(false);
    expect(matches({ type: 'duration_over', seconds: 60 }, { durationSeconds: null })).toBe(true);
    expect(
      matches({ type: 'channel_is', channel: 'x' }, { channelId: null, channelName: null }),
    ).toBe(true);
  });

  it('names the failing conditions with their negation', () => {
    expect(evaluateMatcher(DEFAULT_VIDEO_MATCHER, ctx({ isShort: true }))).toEqual({
      matches: false,
      failing: ['no shorts'],
    });
    expect(
      evaluateMatcher(DEFAULT_VIDEO_MATCHER, ctx({ isShort: true, publishedAt: '2020-01-01' })),
    ).toEqual({ matches: false, failing: ['no shorts', 'not older than 90 days'] });
    expect(
      evaluateMatcher(DEFAULT_VIDEO_MATCHER, ctx({ availability: 'subscriber_only' })),
    ).toEqual({ matches: false, failing: ['not members only'] });
    expect(evaluateMatcher(DEFAULT_VIDEO_MATCHER, ctx({ availability: 'public' }))).toEqual({
      matches: true,
    });
    expect(evaluateMatcher(and(or(artemis, orion)), ctx({ title: 'Mars' }))).toEqual({
      matches: false,
      failing: ['only "Artemis"', 'only "Orion"'],
    });
    expect(evaluateMatcher(DEFAULT_VIDEO_MATCHER, ctx())).toEqual({ matches: true });
    expect(evaluateMatcher(DEFAULT_MUSIC_MATCHER, ctx())).toEqual({ matches: true });
  });
});

describe('Matcher schema', () => {
  it('accepts every leaf and trims texts', () => {
    const tree = and(
      { type: 'title_contains', text: '  Artemis ' },
      { type: 'title_matches', pattern: '^Orion' },
      { type: 'is_short' },
      { type: 'is_members_only' },
      { type: 'published_before', date: '2026-01-01' },
      { type: 'published_after', date: '2025-01-01' },
      { type: 'older_than_days', days: 90 },
      { type: 'duration_under', seconds: 60 },
      { type: 'duration_over', seconds: 0 },
      { type: 'live_status', status: 'was_live' },
      { type: 'channel_is', channel: 'NASA' },
      { type: 'in_playlist_position_under', position: 11 },
      or(),
      not({ type: 'is_short' }),
    );
    const parsed = Matcher.parse(tree);
    expect(parsed.type === 'and' && parsed.items[0]).toEqual({
      type: 'title_contains',
      text: 'Artemis',
    });
  });

  it.each([
    { type: 'nope' },
    { type: 'and' },
    { type: 'and', items: [{ type: 'is_short', extra: 1 }] },
    { type: 'is_members_only', availability: 'subscriber_only' },
    { type: 'not', items: [] },
    { type: 'title_contains', text: '   ' },
    { type: 'title_contains', text: 'x'.repeat(201) },
    { type: 'title_matches', pattern: '([' },
    { type: 'published_after', date: '2025-02-30' },
    { type: 'published_after', date: '2025-01-05T00:00:00Z' },
    { type: 'older_than_days', days: 0 },
    { type: 'older_than_days', days: 1.5 },
    { type: 'duration_under', seconds: 0 },
    { type: 'live_status', status: 'streaming' },
    { type: 'in_playlist_position_under', position: 1 },
  ])('rejects %j', (input) => {
    expect(Matcher.safeParse(input).success).toBe(false);
  });

  it('explains an invalid regex', () => {
    expect(regexError('(')).toMatch(/^Not a valid regular expression/);
    expect(regexError('a+')).toBeUndefined();
  });

  it(`limits the depth to ${MATCHER_MAX_DEPTH}`, () => {
    let tree: Matcher = { type: 'is_short' };
    for (let level = 1; level < MATCHER_MAX_DEPTH; level++) tree = not(tree);
    expect(matcherDepth(tree)).toBe(MATCHER_MAX_DEPTH);
    expect(Matcher.safeParse(tree).success).toBe(true);
    expect(Matcher.safeParse(not(tree)).success).toBe(false);
  });

  it('refuses absurdly deep input without recursing into it', () => {
    let tree: unknown = { type: 'is_short' };
    for (let level = 0; level < 20_000; level++) tree = { type: 'not', item: tree };
    const result = Matcher.safeParse(tree);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at most 8 levels/);
  });

  it(`limits the size to ${MATCHER_MAX_NODES} nodes`, () => {
    expect(matcherSize(and(...items(MATCHER_MAX_NODES - 1)))).toBe(MATCHER_MAX_NODES);
    expect(Matcher.safeParse(and(...items(MATCHER_MAX_NODES - 1))).success).toBe(true);
    expect(Matcher.safeParse(and(...items(MATCHER_MAX_NODES))).success).toBe(false);
  });
});

const items = (n: number) => Array.from({ length: n }, () => ({ type: 'is_short' as const }));

describe('describeMatcher', () => {
  it('gives one chip per root item and joins an or of titles', () => {
    expect(
      describeMatcher(
        and(
          not({ type: 'is_short' }),
          or(
            { type: 'title_contains', text: 'Artemis' },
            { type: 'title_contains', text: 'Orion' },
          ),
          not({ type: 'older_than_days', days: 90 }),
        ),
      ),
    ).toEqual(['no shorts', 'only "Artemis" or "Orion"', 'not older than 90 days']);
  });

  it('describes the defaults', () => {
    expect(describeMatcher(DEFAULT_VIDEO_MATCHER)).toEqual([
      'no shorts',
      'not older than 90 days',
      'not members only',
    ]);
    expect(DEFAULT_VIDEO_MATCHER).toEqual(
      and(
        not({ type: 'is_short' }),
        not({ type: 'older_than_days', days: 90 }),
        not({ type: 'is_members_only' }),
      ),
    );
    expect(describeMatcher(DEFAULT_MUSIC_MATCHER)).toEqual([]);
    expect(describeMatcher(or())).toEqual(['nothing']);
  });

  it('flattens nested ands and parenthesises deeper groups', () => {
    expect(
      describeMatcher(
        and(
          and({ type: 'published_after', date: '2026-01-01' }),
          or(and({ type: 'is_short' }, { type: 'duration_under', seconds: 30 }), {
            type: 'title_matches',
            pattern: 'live',
          }),
          not(or({ type: 'is_short' }, { type: 'live_status', status: 'was_live' })),
        ),
      ),
    ).toEqual([
      'since 2026-01-01',
      '(only shorts and under 30 s) or regex /live/',
      'none of (only shorts, past stream)',
    ]);
    expect(
      describeMatcher(
        and(
          not(or({ type: 'title_contains', text: 'A' }, { type: 'title_contains', text: 'B' })),
          not(and({ type: 'is_short' }, { type: 'duration_under', seconds: 30 })),
          not(not({ type: 'is_short' })),
          not(or({ type: 'is_short' })),
        ),
      ),
    ).toEqual([
      'no "A" or "B"',
      'not all of (only shorts, under 30 s)',
      'only shorts',
      'no shorts',
    ]);
    expect(describeMatcher({ type: 'is_short' })).toEqual(['only shorts']);
  });

  it('labels every leaf both ways', () => {
    const cases: [MatcherLeaf, string, string][] = [
      [{ type: 'title_contains', text: 'A' }, 'only "A"', 'not "A"'],
      [{ type: 'title_matches', pattern: 'x+' }, 'regex /x+/', 'not /x+/'],
      [{ type: 'is_short' }, 'only shorts', 'no shorts'],
      [{ type: 'is_members_only' }, 'members only', 'not members only'],
      [{ type: 'published_before', date: '2026-01-01' }, 'before 2026-01-01', 'since 2026-01-01'],
      [{ type: 'published_after', date: '2026-01-01' }, 'since 2026-01-01', 'before 2026-01-01'],
      [{ type: 'older_than_days', days: 1 }, 'older than 1 day', 'not older than 1 day'],
      [{ type: 'duration_under', seconds: 90 }, 'under 1 min 30 s', 'not under 1 min 30 s'],
      [{ type: 'duration_over', seconds: 3600 }, 'over 1 h', 'not over 1 h'],
      [{ type: 'live_status', status: 'is_live' }, 'live now', 'not live now'],
      [{ type: 'channel_is', channel: 'NASA' }, 'by "NASA"', 'not by "NASA"'],
      [{ type: 'in_playlist_position_under', position: 2 }, 'first 1 entry', 'not first 1 entry'],
      [
        { type: 'in_playlist_position_under', position: 11 },
        'first 10 entries',
        'not first 10 entries',
      ],
    ];
    for (const [value, positive, negative] of cases) {
      expect(describeLeaf(value)).toBe(positive);
      expect(describeLeaf(value, true)).toBe(negative);
    }
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
  });
});
