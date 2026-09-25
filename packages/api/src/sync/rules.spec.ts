import { DEFAULT_MUSIC_MATCHER, DEFAULT_VIDEO_MATCHER, and, not, or } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import type { SourceEntry } from '../ytdlp/metadata.js';
import { type EntryContext, entryContext, evaluateItem } from './rules.js';

const NOW = new Date('2026-09-24T12:00:00Z');
const CHANNEL: EntryContext = {
  now: NOW,
  channelName: 'NASA',
  channelId: 'UCnasa',
  playlistPosition: null,
};

function entry(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    kind: 'video',
    id: 'abc123',
    title: 'Hand-cut dovetails',
    url: 'https://www.youtube.com/watch?v=abc123',
    duration: 600,
    uploadDate: '2026-09-20',
    timestamp: null,
    liveStatus: null,
    isShort: false,
    tab: 'videos',
    channelId: null,
    channel: null,
    thumbnails: [],
    expectedStreams: [],
    expectedBytes: null,
    ...overrides,
  };
}

const accept = { accept: true };

describe('evaluateItem', () => {
  it('accepts everything with the empty and', () => {
    expect(evaluateItem(entry(), and(), CHANNEL)).toEqual(accept);
    expect(evaluateItem(entry({ isShort: true, uploadDate: null }), and(), CHANNEL)).toEqual(
      accept,
    );
    expect(
      evaluateItem(entry({ title: 'Live at Wembley' }), DEFAULT_MUSIC_MATCHER, CHANNEL),
    ).toEqual(accept);
  });

  it('rejects what the matcher does not match as no_match, naming the conditions', () => {
    expect(evaluateItem(entry({ isShort: true }), DEFAULT_VIDEO_MATCHER, CHANNEL)).toEqual({
      accept: false,
      reason: 'no_match',
      transient: false,
      failing: ['no shorts'],
    });
    expect(
      evaluateItem(entry({ uploadDate: '2026-01-01' }), DEFAULT_VIDEO_MATCHER, CHANNEL),
    ).toMatchObject({ reason: 'no_match', failing: ['not older than 90 days'] });
  });

  it('never downloads an ongoing or upcoming stream, whatever the rules (transient)', () => {
    for (const matcher of [and(), DEFAULT_VIDEO_MATCHER, or({ type: 'is_short' }, and())]) {
      expect(evaluateItem(entry({ liveStatus: 'is_upcoming' }), matcher, CHANNEL)).toEqual({
        accept: false,
        reason: 'upcoming',
        transient: true,
        failing: [],
      });
      expect(evaluateItem(entry({ liveStatus: 'is_live' }), matcher, CHANNEL)).toMatchObject({
        reason: 'live',
        transient: true,
      });
      expect(evaluateItem(entry({ liveStatus: 'post_live' }), matcher, CHANNEL)).toMatchObject({
        reason: 'live',
        transient: true,
      });
    }
    expect(evaluateItem(entry({ liveStatus: 'was_live' }), and(), CHANNEL)).toEqual(accept);
  });

  it('accepts entries without a date under date rules', () => {
    const since = and({ type: 'published_after', date: '2026-09-01' });
    expect(evaluateItem(entry({ uploadDate: null }), since, CHANNEL)).toEqual(accept);
    expect(evaluateItem(entry({ uploadDate: null }), DEFAULT_VIDEO_MATCHER, CHANNEL)).toEqual(
      accept,
    );
  });

  it('applies the default video rules against the given clock', () => {
    expect(
      evaluateItem(entry({ uploadDate: '2026-06-26' }), DEFAULT_VIDEO_MATCHER, CHANNEL),
    ).toEqual(accept);
    expect(
      evaluateItem(entry({ uploadDate: '2026-06-25' }), DEFAULT_VIDEO_MATCHER, CHANNEL).accept,
    ).toBe(false);
  });

  it('builds the nested rule from the roadmap', () => {
    const tree = and(
      not({ type: 'is_short' }),
      or({ type: 'title_contains', text: 'Artemis' }, { type: 'title_contains', text: 'Orion' }),
      not({ type: 'older_than_days', days: 90 }),
    );
    expect(evaluateItem(entry({ title: 'Artemis II rollout' }), tree, CHANNEL)).toEqual(accept);
    expect(evaluateItem(entry({ title: 'Orion splashdown' }), tree, CHANNEL)).toEqual(accept);
    expect(evaluateItem(entry({ title: 'Mars rover' }), tree, CHANNEL)).toMatchObject({
      reason: 'no_match',
      failing: ['only "Artemis"', 'only "Orion"'],
    });
  });
});

describe('entryContext', () => {
  it('uses the entry uploader, else the source channel, and the timestamp as a date', () => {
    const at = Date.parse('2026-09-01T10:00:00Z') / 1000;
    expect(
      entryContext(entry({ uploadDate: null, timestamp: at, duration: 59.6 }), CHANNEL),
    ).toMatchObject({
      publishedAt: '2026-09-01',
      durationSeconds: 60,
      channelName: 'NASA',
      channelId: 'UCnasa',
    });
    expect(
      entryContext(entry({ channel: 'ESA', channelId: 'UCesa' }), {
        ...CHANNEL,
        playlistPosition: 3,
      }),
    ).toMatchObject({ channelName: 'ESA', channelId: 'UCesa', playlistPosition: 3 });
  });

  it('lets playlist rules see the uploader and the position', () => {
    const tree = and(
      { type: 'channel_is', channel: 'esa' },
      { type: 'in_playlist_position_under', position: 3 },
    );
    const inPlaylist = (position: number, channel: string) =>
      evaluateItem(entry({ channel, channelId: `UC${channel}` }), tree, {
        now: NOW,
        channelName: null,
        channelId: null,
        playlistPosition: position,
      }).accept;
    expect(inPlaylist(2, 'ESA')).toBe(true);
    expect(inPlaylist(3, 'ESA')).toBe(false);
    expect(inPlaylist(1, 'NASA')).toBe(false);
  });
});
