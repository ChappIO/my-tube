import { describe, expect, it } from 'vitest';
import {
  checkedAgo,
  countOf,
  formatBytes,
  formatCadence,
  formatCount,
  relativeTime,
} from './format';

const NOW = Date.parse('2026-09-24T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [MIN, '1 min ago'],
    [12 * MIN, '12 min ago'],
    [59 * MIN, '59 min ago'],
    [HOUR, '1 h ago'],
    [23 * HOUR, '23 h ago'],
    [DAY, '1 day ago'],
    [2 * DAY, '2 days ago'],
    [13 * DAY, '13 days ago'],
    [14 * DAY, '2 weeks ago'],
    [45 * DAY, '6 weeks ago'],
    [60 * DAY, '2 months ago'],
    [364 * DAY, '12 months ago'],
    [365 * DAY, '1 year ago'],
    [800 * DAY, '2 years ago'],
  ])('%i ms ago reads %s', (elapsed, expected) => {
    expect(relativeTime(ago(elapsed), NOW)).toBe(expected);
  });

  it('reads future and invalid times as just now', () => {
    expect(relativeTime(ago(-5 * MIN), NOW)).toBe('just now');
    expect(relativeTime('not a date', NOW)).toBe('just now');
  });
});

describe('checkedAgo', () => {
  it('prefixes the relative time, or says never checked', () => {
    expect(checkedAgo(ago(12 * MIN), NOW)).toBe('checked 12 min ago');
    expect(checkedAgo(null, NOW)).toBe('never checked');
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [-1, '0 B'],
    [999, '999 B'],
    [1000, '1 KB'],
    [1_500, '1.5 KB'],
    [512_000, '512 KB'],
    [999_600, '1 MB'],
    [1_200_000_000, '1.2 GB'],
    [38_000_000_000, '38 GB'],
    [130_400_000_000, '130 GB'],
    [2_000_000_000_000, '2 TB'],
  ])('%i bytes is %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('counts', () => {
  it('adds thousands separators and pluralises', () => {
    expect(formatCount(1204)).toBe('1,204');
    expect(countOf(1, 'video')).toBe('1 video');
    expect(countOf(1204, 'video')).toBe('1,204 videos');
    expect(countOf(0, 'video')).toBe('0 videos');
  });
});

describe('formatCadence', () => {
  it('uses one decimal, and 0 when unknown', () => {
    expect(formatCadence(null)).toBe('0 uploads/week');
    expect(formatCadence(0)).toBe('0 uploads/week');
    expect(formatCadence(3)).toBe('3.0 uploads/week');
    expect(formatCadence(3.24)).toBe('3.2 uploads/week');
    expect(formatCadence(1)).toBe('1.0 upload/week');
    expect(formatCadence(0.3)).toBe('0.3 uploads/week');
  });
});
