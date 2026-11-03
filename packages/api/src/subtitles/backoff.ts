/*
 * The local rate limit on caption fetches (backend skill "Subtitles"). YouTube answers bursts of
 * caption requests with HTTP 429 and yt-dlp gives up on the track, so subtitle jobs run one at a
 * time with a gap between fetches, and a 429 pauses the whole subtitle queue for a while that
 * doubles on each 429 in a row.
 */

/** The gap between two caption fetches (any outcome), so a long backlog never bursts. */
export const SUBTITLE_SPACING_MS = 20_000;

/** Pauses after the 1st, 2nd, … 429 in a row: 15 min, 30 min, 1 h, 2 h, 4 h, then 6 h. */
export const SUBTITLE_PAUSES_MS = [
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
  2 * 3_600_000,
  4 * 3_600_000,
  6 * 3_600_000,
] as const;

/** Remembers how many 429s came in a row (in memory: a restart starts over at 15 minutes). */
export class SubtitleBackoff {
  private strikes = 0;

  /** A caption fetch got through: the next 429 pauses 15 minutes again. */
  succeeded(): void {
    this.strikes = 0;
  }

  /** A 429: when the subtitle queue may go on. */
  rateLimited(now: Date): Date {
    const pause = SUBTITLE_PAUSES_MS[Math.min(this.strikes, SUBTITLE_PAUSES_MS.length - 1)]!;
    this.strikes += 1;
    return new Date(now.getTime() + pause);
  }

  /** 429s in a row so far. */
  get count(): number {
    return this.strikes;
  }
}

/** When the next fetch may start after one finished at `now`. */
export function nextFetchAt(now: Date): Date {
  return new Date(now.getTime() + SUBTITLE_SPACING_MS);
}

/** Whether a yt-dlp subtitle failure is YouTube's rate limit (`HTTP Error 429`). */
export function isRateLimit(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && /HTTP Error 429|Too Many Requests/i.test(reason);
}
