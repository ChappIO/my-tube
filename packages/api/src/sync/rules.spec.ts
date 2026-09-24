import {
  DEFAULT_MUSIC_RULES,
  DEFAULT_VIDEO_RULES,
  type MusicSourceRules,
  type VideoSourceRules,
} from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { evaluateItem, keepCutoff, type EvaluatedEntry } from './rules.js';

const NOW = new Date('2026-09-24T12:00:00Z');

function entry(overrides: Partial<EvaluatedEntry> = {}): EvaluatedEntry {
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
    thumbnails: [],
    ...overrides,
  };
}

/** Video rules with everything off, so each test turns on the rule it is about. */
const OPEN_VIDEO: VideoSourceRules = {
  ...DEFAULT_VIDEO_RULES,
  skipShorts: false,
  keepDays: null,
  publishedAfter: null,
  titleFilter: null,
};
const OPEN_MUSIC: MusicSourceRules = {
  ...DEFAULT_MUSIC_RULES,
  skipLiveRecordings: false,
  downloadFullAlbums: false,
};

const accept = { accept: true };
const reject = (reason: string, transient = false) => ({ accept: false, reason, transient });

describe('evaluateItem', () => {
  it('accepts anything when every rule is off', () => {
    expect(evaluateItem(entry(), OPEN_VIDEO, NOW)).toEqual(accept);
    expect(evaluateItem(entry({ isShort: true, uploadDate: null }), OPEN_VIDEO, NOW)).toEqual(
      accept,
    );
    expect(evaluateItem(entry({ title: 'Live at Wembley' }), OPEN_MUSIC, NOW)).toEqual(accept);
  });

  describe('skipShorts', () => {
    const rules = { ...OPEN_VIDEO, skipShorts: true };
    it('rejects shorts', () => {
      expect(evaluateItem(entry({ isShort: true }), rules, NOW)).toEqual(reject('short'));
    });
    it('accepts regular videos', () => {
      expect(evaluateItem(entry({ isShort: false }), rules, NOW)).toEqual(accept);
    });
    it('accepts shorts when off', () => {
      expect(evaluateItem(entry({ isShort: true }), OPEN_VIDEO, NOW)).toEqual(accept);
    });
  });

  describe('titleFilter', () => {
    const rules = { ...OPEN_VIDEO, titleFilter: 'Monologue' };
    it('accepts a case-insensitive substring match', () => {
      expect(evaluateItem(entry({ title: 'Late night MONOLOGUE, part 2' }), rules, NOW)).toEqual(
        accept,
      );
    });
    it('rejects titles without the substring', () => {
      expect(evaluateItem(entry({ title: 'Interview' }), rules, NOW)).toEqual(
        reject('title_filter'),
      );
    });
    it('treats the filter as plain text, not a pattern', () => {
      const dotted = { ...OPEN_VIDEO, titleFilter: 'a.b' };
      expect(evaluateItem(entry({ title: 'axb' }), dotted, NOW)).toEqual(reject('title_filter'));
      expect(evaluateItem(entry({ title: 'the a.b show' }), dotted, NOW)).toEqual(accept);
    });
    it('rejects entries without a title', () => {
      expect(evaluateItem(entry({ title: null }), rules, NOW)).toEqual(reject('title_filter'));
    });
  });

  describe('publishedAfter', () => {
    const rules = { ...OPEN_VIDEO, publishedAfter: '2026-09-01' };
    it('rejects items published before the date', () => {
      expect(evaluateItem(entry({ uploadDate: '2026-08-31' }), rules, NOW)).toEqual(
        reject('published_before'),
      );
    });
    it('accepts items published on the date', () => {
      expect(evaluateItem(entry({ uploadDate: '2026-09-01' }), rules, NOW)).toEqual(accept);
    });
    it('accepts items published after the date', () => {
      expect(evaluateItem(entry({ uploadDate: '2026-09-02' }), rules, NOW)).toEqual(accept);
    });
    it('falls back to the timestamp', () => {
      const before = Date.parse('2026-08-31T23:59:59Z') / 1000;
      const onDay = Date.parse('2026-09-01T00:00:00Z') / 1000;
      expect(evaluateItem(entry({ uploadDate: null, timestamp: before }), rules, NOW)).toEqual(
        reject('published_before'),
      );
      expect(evaluateItem(entry({ uploadDate: null, timestamp: onDay }), rules, NOW)).toEqual(
        accept,
      );
    });
    it('accepts items without a date', () => {
      expect(evaluateItem(entry({ uploadDate: null, timestamp: null }), rules, NOW)).toEqual(
        accept,
      );
    });
  });

  describe('keepDays', () => {
    const rules = { ...OPEN_VIDEO, keepDays: 30 };
    it('computes the cutoff by UTC date', () => {
      expect(keepCutoff(NOW, 30)).toBe('2026-08-25');
      expect(keepCutoff(new Date('2026-09-24T00:00:00Z'), 1)).toBe('2026-09-23');
    });
    it('rejects items older than the window', () => {
      expect(evaluateItem(entry({ uploadDate: '2026-08-24' }), rules, NOW)).toEqual(
        reject('older_than_keep_days'),
      );
    });
    it('accepts items on the boundary day and inside the window', () => {
      expect(evaluateItem(entry({ uploadDate: '2026-08-25' }), rules, NOW)).toEqual(accept);
      expect(evaluateItem(entry({ uploadDate: '2026-09-24' }), rules, NOW)).toEqual(accept);
    });
    it('accepts items without a date', () => {
      expect(evaluateItem(entry({ uploadDate: null }), rules, NOW)).toEqual(accept);
    });
    it('keeps everything when null', () => {
      expect(evaluateItem(entry({ uploadDate: '2001-01-01' }), OPEN_VIDEO, NOW)).toEqual(accept);
    });
  });

  describe('live streams (both libraries)', () => {
    for (const rules of [OPEN_VIDEO, OPEN_MUSIC]) {
      it(`never downloads an ongoing or upcoming stream (${rules.library})`, () => {
        expect(evaluateItem(entry({ liveStatus: 'is_upcoming' }), rules, NOW)).toEqual(
          reject('upcoming', true),
        );
        expect(evaluateItem(entry({ liveStatus: 'is_live' }), rules, NOW)).toEqual(
          reject('live', true),
        );
        expect(evaluateItem(entry({ liveStatus: 'post_live' }), rules, NOW)).toEqual(
          reject('live', true),
        );
      });
      it(`accepts finished streams and regular uploads (${rules.library})`, () => {
        expect(evaluateItem(entry({ liveStatus: 'was_live' }), rules, NOW)).toEqual(accept);
        expect(evaluateItem(entry({ liveStatus: 'not_live' }), rules, NOW)).toEqual(accept);
      });
    }
  });

  describe('skipLiveRecordings', () => {
    const rules = { ...OPEN_MUSIC, skipLiveRecordings: true };
    it('rejects titles containing the word "live"', () => {
      for (const title of ['Live at Wembley', 'Song (Live)', 'Song - LIVE', 'song [live 1999]']) {
        expect(evaluateItem(entry({ title }), rules, NOW)).toEqual(reject('live'));
      }
    });
    it('accepts "live" inside another word', () => {
      for (const title of ['Olive Tree', 'Delivery', 'Lively', 'Alive']) {
        expect(evaluateItem(entry({ title }), rules, NOW)).toEqual(accept);
      }
    });
    it('is not transient', () => {
      expect(evaluateItem(entry({ title: 'Live' }), rules, NOW)).toMatchObject({
        transient: false,
      });
    });
  });

  describe('downloadFullAlbums', () => {
    const rules = { ...OPEN_MUSIC, downloadFullAlbums: true };
    it('rejects entries known to be singles', () => {
      expect(evaluateItem(entry({ albumType: 'single' }), rules, NOW)).toEqual(reject('not_album'));
    });
    it('accepts albums and EPs', () => {
      expect(evaluateItem(entry({ albumType: 'album' }), rules, NOW)).toEqual(accept);
      expect(evaluateItem(entry({ albumType: 'ep' }), rules, NOW)).toEqual(accept);
    });
    it('accepts entries without album information (flat listings)', () => {
      expect(evaluateItem(entry(), rules, NOW)).toEqual(accept);
      expect(evaluateItem(entry({ kind: 'playlist', albumType: null }), rules, NOW)).toEqual(
        accept,
      );
    });
    it('accepts singles when off', () => {
      expect(evaluateItem(entry({ albumType: 'single' }), OPEN_MUSIC, NOW)).toEqual(accept);
    });
  });

  it('ignores the other library’s rules', () => {
    // A music source never rejects shorts or old items; a video source never rejects "live".
    expect(
      evaluateItem(entry({ isShort: true, uploadDate: '2001-01-01' }), DEFAULT_MUSIC_RULES, NOW),
    ).toEqual(accept);
    expect(evaluateItem(entry({ title: 'Live!' }), OPEN_VIDEO, NOW)).toEqual(accept);
  });

  it('reports the first failing rule', () => {
    const rules = { ...OPEN_VIDEO, skipShorts: true, titleFilter: 'x', keepDays: 1 };
    const old = entry({ isShort: true, title: 'nope', uploadDate: '2001-01-01' });
    expect(evaluateItem(old, rules, NOW)).toEqual(reject('short'));
    expect(evaluateItem({ ...old, isShort: false }, rules, NOW)).toEqual(
      reject('older_than_keep_days'),
    );
    expect(evaluateItem({ ...old, isShort: false, liveStatus: 'is_live' }, rules, NOW)).toEqual(
      reject('live', true),
    );
  });

  it('applies the handoff defaults: no shorts, last 90 days', () => {
    expect(evaluateItem(entry({ isShort: true }), DEFAULT_VIDEO_RULES, NOW)).toEqual(
      reject('short'),
    );
    expect(evaluateItem(entry({ uploadDate: '2026-06-25' }), DEFAULT_VIDEO_RULES, NOW)).toEqual(
      reject('older_than_keep_days'),
    );
    expect(evaluateItem(entry({ uploadDate: '2026-06-26' }), DEFAULT_VIDEO_RULES, NOW)).toEqual(
      accept,
    );
  });
});
