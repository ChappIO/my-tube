/*
 * Display formatting shared by the screens: relative times, sizes, counts and upload cadence.
 * Pure functions; `now` is a parameter so tests and `useNow` control the clock.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * How long ago an ISO timestamp was, in the handoff's style: `just now`, `12 min ago`,
 * `1 h ago`, `2 days ago`, `3 weeks ago`, `4 months ago`, `2 years ago`. Times in the future
 * (clock skew) and unparsable ones read `just now`.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  const days = Math.floor(elapsed / DAY);
  if (days < 14) return `${plural(days, 'day')} ago`;
  if (days < 60) return `${plural(Math.floor(days / 7), 'week')} ago`;
  if (days < 365) return `${plural(Math.floor(days / 30), 'month')} ago`;
  return `${plural(Math.floor(days / 365), 'year')} ago`;
}

/** `checked 12 min ago`, or `never checked` before the first check. */
export function checkedAgo(iso: string | null, now: number = Date.now()): string {
  return iso === null ? 'never checked' : `checked ${relativeTime(iso, now)}`;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Size in decimal units, as disks and the handoff write them: `0 B`, `512 KB`, `1.2 GB`,
 * `38 GB`. One decimal below 10 of a unit, whole numbers above.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  // 999.6 KB rounds to 1000 KB; carry into the next unit instead.
  if (rounded >= 1000 && unit < BYTE_UNITS.length - 1) return `1 ${BYTE_UNITS[unit + 1]}`;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** A count with thousands separators: `1,204`. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** `3 videos`, `1 video`, `1,204 tracks`. */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * Upload cadence for the Add modal's source card: `3.2 uploads/week`, `1.0 upload/week`, and
 * `0 uploads/week` when unknown (fewer than two dated uploads).
 */
export function formatCadence(uploadsPerWeek: number | null): string {
  if (uploadsPerWeek === null || uploadsPerWeek <= 0) return '0 uploads/week';
  const value = uploadsPerWeek.toFixed(1);
  return `${value} ${value === '1.0' ? 'upload' : 'uploads'}/week`;
}
