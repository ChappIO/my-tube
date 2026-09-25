import { describe, expect, it } from 'vitest';
import { lastBackupLabel, librarySizeText } from './format';

/** A local time on a local day, as the browser would read an ISO timestamp. */
const local = (year: number, month: number, day: number, hours: number, minutes = 0) =>
  new Date(year, month - 1, day, hours, minutes).toISOString();

describe('lastBackupLabel', () => {
  const now = new Date(2026, 8, 26, 9, 15);

  it('reads never before the first backup', () => {
    expect(lastBackupLabel(null, now)).toBe('never');
  });

  it('names today and yesterday with the local time', () => {
    expect(lastBackupLabel(local(2026, 9, 26, 4), now)).toBe('today 04:00');
    expect(lastBackupLabel(local(2026, 9, 25, 4), now)).toBe('yesterday 04:00');
    expect(lastBackupLabel(local(2026, 9, 25, 23, 59), now)).toBe('yesterday 23:59');
  });

  it('gives the date and time for anything older', () => {
    expect(lastBackupLabel(local(2026, 9, 24, 4, 5), now)).toBe('2026-09-24 04:05');
    expect(lastBackupLabel(local(2025, 12, 31, 4), now)).toBe('2025-12-31 04:00');
  });
});

describe('librarySizeText', () => {
  it('is empty until the library is indexed', () => {
    expect(librarySizeText({ sizeBytes: 0, itemCount: 0 }, null, 'track')).toBeNull();
  });

  it('reads size and count once rescanned or once something is on disk', () => {
    expect(
      librarySizeText({ sizeBytes: 282e9, itemCount: 3104 }, '2026-09-26T02:30:00Z', 'track'),
    ).toBe('282 GB · 3,104 tracks');
    expect(librarySizeText({ sizeBytes: 130e9, itemCount: 368 }, null, 'video')).toBe(
      '130 GB · 368 videos',
    );
    expect(librarySizeText({ sizeBytes: 0, itemCount: 0 }, '2026-09-26T02:30:00Z', 'video')).toBe(
      '0 B · 0 videos',
    );
  });
});
