import { describe, expect, it } from 'vitest';
import { dayLabel, formatLength, publishedAgo } from './format';

describe('library formatting', () => {
  it('formats video lengths for the duration badge', () => {
    expect(formatLength(0)).toBe('0:00');
    expect(formatLength(245)).toBe('4:05');
    expect(formatLength(2892)).toBe('48:12');
    expect(formatLength(3729)).toBe('1:02:09');
    expect(formatLength(59.6)).toBe('1:00');
  });

  it('labels Home day groups', () => {
    // Local noon on a Friday.
    const now = new Date(2026, 8, 25, 12, 0);
    expect(dayLabel('2026-09-25', now)).toBe('Today');
    expect(dayLabel('2026-09-24', now)).toBe('Yesterday');
    expect(dayLabel('2026-09-21', now)).toBe('Monday');
    expect(dayLabel('2026-09-18', now)).toBe('2026-09-18');
    expect(dayLabel('garbage', now)).toBe('garbage');
  });

  it('says when a video was published', () => {
    const now = new Date(2026, 8, 25, 12, 0).getTime();
    expect(publishedAgo(null, now)).toBe('');
    expect(publishedAgo('2026-09-25', now)).toBe('today');
    expect(publishedAgo('2026-09-24', now)).toBe('yesterday');
    expect(publishedAgo('2026-09-20', now)).toBe('5 days ago');
    expect(publishedAgo('2026-08-01', now)).toBe('7 weeks ago');
    expect(publishedAgo(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 h ago');
  });
});
