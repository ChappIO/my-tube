/*
 * Number formatting shared by the web app and the API's history lines (`rescan · 3,104 tracks,
 * 368 videos on disk · 282 GB`).
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Size in decimal units, as disks write them: `0 B`, `512 KB`, `1.2 GB`,
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
