/*
 * Pure helpers of the inline job log panel (`JobLogPanel`), tested in `job-log.spec.ts`.
 */

/** The panel keeps the newest this many lines; a long yt-dlp run logs thousands. */
export const JOB_LOG_MAX_LINES = 500;

/**
 * The tail of a log: its last `max` lines (a trailing newline is not a line) and how many were
 * left out before them.
 */
export function tailLines(
  text: string,
  max = JOB_LOG_MAX_LINES,
): { text: string; dropped: number } {
  const lines = text.replace(/\n$/, '').split('\n');
  if (lines.length <= max) return { text: lines.join('\n'), dropped: 0 };
  return { text: lines.slice(-max).join('\n'), dropped: lines.length - max };
}

/** How close to the bottom (px) still counts as "at the bottom", so new lines keep following. */
const FOLLOW_SLACK_PX = 16;

/**
 * Whether the panel is scrolled to the bottom. While it is, new lines scroll it along; once the
 * reader scrolls up to read, it stays where it is until they scroll back down.
 */
export function isAtBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= FOLLOW_SLACK_PX;
}
