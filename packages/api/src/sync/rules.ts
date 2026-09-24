import {
  evaluateMatcher,
  type Matcher,
  type MatcherContext,
  type SkipReason,
} from '@mytube/shared';
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
      /** The conditions the entry failed (`no shorts`), for logs. Empty for transient ones. */
      failing: string[];
    };

/** Where an entry sits: the facts the matcher needs that the entry itself does not carry. */
export interface EntryContext {
  now: Date;
  /**
   * The uploader when the entry does not name one: a channel source's own listing is flat and
   * carries no uploader per entry.
   */
  channelName: string | null;
  channelId: string | null;
  /** 1-based position in a playlist source's listing; null for channels and artists. */
  playlistPosition: number | null;
}

/**
 * Decides whether a source's rules accept a fetched entry. Pure: no database, no clock (the
 * caller passes `now`), no yt-dlp.
 *
 * Before the rules, in both libraries: a scheduled premiere or stream (`is_upcoming` →
 * `upcoming`) and a stream on air or still processing (`is_live`, `post_live` → `live`) are
 * never downloaded. Both are `transient`: the sync does not store them but looks again on the
 * next check. Then the source's matcher decides (`evaluateMatcher`); a miss is `no_match`.
 *
 * Entries without a date or duration are not dropped for it: the matcher treats the missing
 * value as unknown, and unknown counts as a match (flat listings sometimes omit dates, and
 * yt-dlp's flat dates are approximate to the day).
 */
export function evaluateItem(entry: SourceEntry, matcher: Matcher, ctx: EntryContext): RuleVerdict {
  if (entry.liveStatus === 'is_upcoming') return reject('upcoming', true);
  if (entry.liveStatus === 'is_live' || entry.liveStatus === 'post_live') {
    return reject('live', true);
  }
  const result = evaluateMatcher(matcher, entryContext(entry, ctx));
  if (result.matches) return { accept: true };
  return reject('no_match', false, result.failing);
}

/** The matcher's view of a fetched entry. */
export function entryContext(entry: SourceEntry, ctx: EntryContext): MatcherContext {
  return {
    title: entry.title,
    isShort: entry.isShort,
    publishedAt: entryDate(entry),
    durationSeconds: entry.duration === null ? null : Math.round(entry.duration),
    liveStatus: entry.liveStatus,
    channelName: entry.channel ?? ctx.channelName,
    channelId: entry.channelId ?? ctx.channelId,
    playlistPosition: ctx.playlistPosition,
    now: ctx.now,
  };
}

function entryDate(entry: SourceEntry): string | null {
  if (entry.uploadDate) return entry.uploadDate;
  if (entry.timestamp != null) return new Date(entry.timestamp * 1000).toISOString().slice(0, 10);
  return null;
}

function reject(reason: SkipReason, transient: boolean, failing: string[] = []): RuleVerdict {
  return { accept: false, reason, transient, failing };
}
