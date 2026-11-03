import { describe, expect, it } from 'vitest';
import {
  isRateLimit,
  nextFetchAt,
  SUBTITLE_PAUSES_MS,
  SUBTITLE_SPACING_MS,
  SubtitleBackoff,
} from './backoff.js';

describe('SubtitleBackoff', () => {
  it('pauses longer with every 429 in a row, up to 6 hours, and starts over after a success', () => {
    const backoff = new SubtitleBackoff();
    const now = new Date('2026-11-03T10:00:00.000Z');
    const pauses = [...SUBTITLE_PAUSES_MS, SUBTITLE_PAUSES_MS.at(-1)!].map(
      (pause) => new Date(now.getTime() + pause),
    );
    for (const [index, expected] of pauses.entries()) {
      expect(backoff.rateLimited(now)).toEqual(expected);
      expect(backoff.count).toBe(index + 1);
    }
    backoff.succeeded();
    expect(backoff.count).toBe(0);
    expect(backoff.rateLimited(now)).toEqual(new Date(now.getTime() + 15 * 60_000));
  });

  it('spaces fetches 20 seconds apart', () => {
    const now = new Date('2026-11-03T10:00:00.000Z');
    expect(SUBTITLE_SPACING_MS).toBe(20_000);
    expect(nextFetchAt(now)).toEqual(new Date('2026-11-03T10:00:20.000Z'));
  });

  it('recognises the rate limit in a yt-dlp reason', () => {
    expect(
      isRateLimit("Unable to download video subtitles for 'en': HTTP Error 429: Too Many Requests"),
    ).toBe(true);
    expect(isRateLimit("Unable to download video subtitles for 'en': HTTP Error 404")).toBe(false);
    expect(isRateLimit(null)).toBe(false);
  });
});
