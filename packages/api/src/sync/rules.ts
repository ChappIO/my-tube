import type { Rules, SkipReason } from '@mytube/shared';
import type { SourceEntry } from '../ytdlp/metadata.js';

export type RuleVerdict =
  | { accept: true }
  | {
      accept: false;
      reason: SkipReason;
      /**
       * The verdict may change on a later check: a premiere that has not aired, a stream still
       * on air or processing. The sync leaves such entries unrecorded (not `skipped`) so the
       * next check evaluates them again.
       */
      transient: boolean;
    };

const DAY_MS = 86_400_000;
/** "live" as a word: matches "Live at Wembley", "(Live)", not "Olive" or "Delivery". */
const LIVE_WORD = /\blive\b/i;

/**
 * Decides whether a source's rules accept a fetched entry. Pure: no database, no clock (the
 * caller passes `now`), no yt-dlp. The first failing rule wins, in this order:
 *
 * Both libraries:
 * - `upcoming`: a scheduled premiere or stream (`liveStatus` `is_upcoming`).
 * - `live`: a stream that is on air or still processing (`is_live`, `post_live`). Never
 *   download an ongoing stream. Both are `transient`: the sync should not store them as a
 *   permanent skip but evaluate the entry again on the next check.
 *
 * Video rules:
 * - `short` when `skipShorts` and the entry is a short (`/shorts/` URL or the Shorts tab).
 * - `published_before` when `publishedAfter` is set and the entry's date is before it. The
 *   same day is accepted.
 * - `older_than_keep_days` when `keepDays` is set and the entry is older than the window
 *   (`now` minus `keepDays` days, compared by UTC date, so the boundary day is accepted).
 *   Retention would delete such a file on its next run, so downloading it is wasted work. A
 *   new source with `keepDays = 90` therefore downloads only the last 90 days.
 * - `title_filter` when `titleFilter` is set and the title does not contain it
 *   (case-insensitive plain substring). An entry without a title never matches.
 *
 * Entries without a date are accepted by the date rules: flat channel listings sometimes omit
 * it, and dropping them would silently lose uploads. yt-dlp's flat dates are approximate (a
 * day, derived from "3 weeks ago"), so the date rules are day-granular.
 *
 * Music rules:
 * - `live` when `skipLiveRecordings` and the title contains the word "live".
 *
 * An artist source downloads all of the artist's releases, albums and singles alike; there is
 * no album-only rule.
 */
export function evaluateItem(entry: SourceEntry, rules: Rules, now: Date): RuleVerdict {
  if (entry.liveStatus === 'is_upcoming') return reject('upcoming', true);
  if (entry.liveStatus === 'is_live' || entry.liveStatus === 'post_live') {
    return reject('live', true);
  }

  if (rules.library === 'video') {
    if (rules.skipShorts && entry.isShort) return reject('short');
    const date = entryDate(entry);
    if (date !== null && rules.publishedAfter !== null && date < rules.publishedAfter) {
      return reject('published_before');
    }
    if (date !== null && rules.keepDays !== null && date < keepCutoff(now, rules.keepDays)) {
      return reject('older_than_keep_days');
    }
    if (rules.titleFilter !== null) {
      const title = (entry.title ?? '').toLowerCase();
      if (!title.includes(rules.titleFilter.toLowerCase())) return reject('title_filter');
    }
    return { accept: true };
  }

  if (rules.skipLiveRecordings && LIVE_WORD.test(entry.title ?? '')) return reject('live');
  return { accept: true };
}

/** The oldest upload date (`YYYY-MM-DD`, UTC) a `keepDays` window still accepts. */
export function keepCutoff(now: Date, keepDays: number): string {
  return new Date(now.getTime() - keepDays * DAY_MS).toISOString().slice(0, 10);
}

function entryDate(entry: SourceEntry): string | null {
  if (entry.uploadDate) return entry.uploadDate;
  if (entry.timestamp != null) return new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
  return null;
}

function reject(reason: SkipReason, transient = false): RuleVerdict {
  return { accept: false, reason, transient };
}
