import { z } from 'zod';

/*
 * Matchers: a source's rules as one expression tree.
 *
 * Gates (`and`, `or`, `not`) combine predicate leaves (title contains, is a short, older than N
 * days, ...). The same tree decides both directions:
 *
 * - at sync, a fetched entry the tree matches is downloaded; one it does not match is skipped;
 * - on revalidation, an item on disk the (current) tree no longer matches is removed.
 *
 * So "keep the last 90 days" is `not(older_than_days 90)`: newer uploads come in, and a file
 * leaves the library once it turns 91 days old.
 *
 * Empty gates: `and` with no items matches everything (the empty conjunction is true), `or`
 * with no items matches nothing (the empty disjunction is false). The Music default is the
 * empty `and`: download every release. The builder only allows an empty group at the root.
 *
 * Unknown data: a leaf that needs data the item does not have (no upload date, no duration, no
 * playlist position) is unknown, not false. Gates combine unknowns with three-valued logic
 * (false wins in `and`, true wins in `or`, `not` keeps unknown), and an unknown result counts
 * as a match: an entry is never dropped, or a file deleted, for lack of a date. A missing title
 * is not unknown: it contains nothing and matches no pattern.
 */

// ---------------------------------------------------------------------------------------
// Schema.
// ---------------------------------------------------------------------------------------

/** Deepest allowed nesting: the root is level 1, a leaf directly under it level 2. */
export const MATCHER_MAX_DEPTH = 8;
/** Most nodes (gates and leaves) one tree may have. */
export const MATCHER_MAX_NODES = 100;
/** Longest title text or pattern. */
export const MATCHER_TEXT_MAX = 200;
/** Bounds for `older_than_days`. */
export const MATCHER_DAYS_MIN = 1;
export const MATCHER_DAYS_MAX = 3650;
/** Upper bound for durations (24 hours) and playlist positions. */
export const MATCHER_SECONDS_MAX = 86_400;
export const MATCHER_POSITION_MAX = 100_000;

/** yt-dlp's `live_status` values. An entry without one counts as `not_live`. */
export const LIVE_STATUSES = [
  'not_live',
  'is_live',
  'was_live',
  'is_upcoming',
  'post_live',
] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

export const GATE_TYPES = ['and', 'or', 'not'] as const;
export type GateType = (typeof GATE_TYPES)[number];

export const LEAF_TYPES = [
  'title_contains',
  'title_matches',
  'is_short',
  'published_before',
  'published_after',
  'older_than_days',
  'duration_under',
  'duration_over',
  'live_status',
  'channel_is',
  'in_playlist_position_under',
] as const;
export type LeafType = (typeof LEAF_TYPES)[number];

/** Leaves that only mean something for a playlist source (its entries' uploaders, positions). */
export const PLAYLIST_ONLY_LEAVES: readonly LeafType[] = [
  'channel_is',
  'in_playlist_position_under',
];

export type MatcherLeaf =
  /** Case-insensitive plain substring of the title. */
  | { type: 'title_contains'; text: string }
  /** Case-insensitive regular expression tested against the title. */
  | { type: 'title_matches'; pattern: string }
  /** A YouTube short (`/shorts/` URL or the Shorts shelf). */
  | { type: 'is_short' }
  /** Published strictly before the day (`YYYY-MM-DD`, UTC). */
  | { type: 'published_before'; date: string }
  /** Published on or after the day (`YYYY-MM-DD`, UTC). */
  | { type: 'published_after'; date: string }
  /** Published before the day `days` days ago (UTC date; that day itself is not older). */
  | { type: 'older_than_days'; days: number }
  /** Shorter than `seconds`. */
  | { type: 'duration_under'; seconds: number }
  /** Longer than `seconds`. */
  | { type: 'duration_over'; seconds: number }
  /** yt-dlp's live status equals `status`. */
  | { type: 'live_status'; status: LiveStatus }
  /** Uploaded by the channel with this id (`UC…`) or name (case-insensitive). Playlists. */
  | { type: 'channel_is'; channel: string }
  /** Position in the playlist (1-based) is below `position`. Playlists. */
  | { type: 'in_playlist_position_under'; position: number };

export type MatcherGate =
  | { type: 'and'; items: Matcher[] }
  | { type: 'or'; items: Matcher[] }
  | { type: 'not'; item: Matcher };

export type Matcher = MatcherGate | MatcherLeaf;

const Text = z.string().trim().min(1, 'Enter some text.').max(MATCHER_TEXT_MAX);
const Day = z.iso.date('Use a date such as 2026-01-31.');

const Pattern = Text.superRefine((pattern, ctx) => {
  const error = regexError(pattern);
  if (error) ctx.addIssue({ code: 'custom', message: error });
});

const LeafSchemas = [
  z.strictObject({ type: z.literal('title_contains'), text: Text }),
  z.strictObject({ type: z.literal('title_matches'), pattern: Pattern }),
  z.strictObject({ type: z.literal('is_short') }),
  z.strictObject({ type: z.literal('published_before'), date: Day }),
  z.strictObject({ type: z.literal('published_after'), date: Day }),
  z.strictObject({
    type: z.literal('older_than_days'),
    days: z.number().int().min(MATCHER_DAYS_MIN).max(MATCHER_DAYS_MAX),
  }),
  z.strictObject({
    type: z.literal('duration_under'),
    seconds: z.number().int().min(1).max(MATCHER_SECONDS_MAX),
  }),
  z.strictObject({
    type: z.literal('duration_over'),
    seconds: z.number().int().min(0).max(MATCHER_SECONDS_MAX),
  }),
  z.strictObject({ type: z.literal('live_status'), status: z.enum(LIVE_STATUSES) }),
  z.strictObject({ type: z.literal('channel_is'), channel: Text }),
  z.strictObject({
    type: z.literal('in_playlist_position_under'),
    position: z.number().int().min(2).max(MATCHER_POSITION_MAX),
  }),
] as const;

/** The recursive node schema without the size limits (those apply once, at the root). */
const MatcherNode: z.ZodType<Matcher> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('and'), items: z.array(MatcherNode).max(MATCHER_MAX_NODES) }),
    z.strictObject({ type: z.literal('or'), items: z.array(MatcherNode).max(MATCHER_MAX_NODES) }),
    z.strictObject({ type: z.literal('not'), item: MatcherNode }),
    ...LeafSchemas,
  ]),
);

/**
 * A source's rules: a gate or leaf, at most `MATCHER_MAX_DEPTH` levels deep and
 * `MATCHER_MAX_NODES` nodes. Texts are trimmed; patterns must compile as JavaScript regular
 * expressions. Unknown node types and fields are rejected.
 */
export const Matcher: z.ZodType<Matcher> = z
  .unknown()
  .superRefine((value, ctx) => {
    // Checked on the raw JSON first, without recursion, so a hostile body nested thousands of
    // levels deep is refused before the recursive schema walks it.
    if (rawDepth(value) > MATCHER_MAX_DEPTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Rules can nest at most ${MATCHER_MAX_DEPTH} levels deep.`,
        abort: true,
      });
    }
  })
  .pipe(MatcherNode)
  .superRefine((matcher, ctx) => {
    const depth = matcherDepth(matcher);
    if (depth > MATCHER_MAX_DEPTH) {
      ctx.addIssue({
        code: 'custom',
        message: `Rules can nest at most ${MATCHER_MAX_DEPTH} levels deep (this has ${depth}).`,
      });
    }
    const size = matcherSize(matcher);
    if (size > MATCHER_MAX_NODES) {
      ctx.addIssue({
        code: 'custom',
        message: `Rules can have at most ${MATCHER_MAX_NODES} conditions and groups (this has ${size}).`,
      });
    }
  });

/**
 * Nesting of a JSON value counted in matcher levels (`items` arrays and `item` objects), without
 * recursion. Stops counting past the limit.
 */
function rawDepth(value: unknown): number {
  let max = 0;
  const stack: { node: unknown; depth: number }[] = [{ node: value, depth: 1 }];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || typeof next.node !== 'object' || next.node === null) continue;
    max = Math.max(max, next.depth);
    if (max > MATCHER_MAX_DEPTH) return max;
    const node = next.node as { items?: unknown; item?: unknown };
    if (Array.isArray(node.items)) {
      for (const item of node.items as unknown[]) stack.push({ node: item, depth: next.depth + 1 });
    }
    if (node.item !== undefined) stack.push({ node: node.item, depth: next.depth + 1 });
  }
  return max;
}

/** Why `pattern` is not a usable regular expression, or undefined when it is. */
export function regexError(pattern: string): string | undefined {
  try {
    new RegExp(pattern, 'i').test('');
    return undefined;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.replace(/^Invalid regular expression: /, '') : '';
    return `Not a valid regular expression${detail ? `: ${detail}` : ''}.`;
  }
}

export function isGate(matcher: Matcher): matcher is MatcherGate {
  return matcher.type === 'and' || matcher.type === 'or' || matcher.type === 'not';
}

/** Children of a node: a gate's items, `not`'s item, none for a leaf. */
export function childrenOf(matcher: Matcher): Matcher[] {
  if (matcher.type === 'and' || matcher.type === 'or') return matcher.items;
  if (matcher.type === 'not') return [matcher.item];
  return [];
}

/** Levels of the tree: a lone leaf is 1, `and(leaf)` is 2. */
export function matcherDepth(matcher: Matcher): number {
  return 1 + Math.max(0, ...childrenOf(matcher).map(matcherDepth));
}

/** Nodes in the tree, gates included. */
export function matcherSize(matcher: Matcher): number {
  return 1 + childrenOf(matcher).reduce((sum, child) => sum + matcherSize(child), 0);
}

/** Every leaf of the tree, depth first. */
export function matcherLeaves(matcher: Matcher): MatcherLeaf[] {
  return isGate(matcher) ? childrenOf(matcher).flatMap(matcherLeaves) : [matcher];
}

// Builders, for defaults, conversions and tests.
export const and = (...items: Matcher[]): Matcher => ({ type: 'and', items });
export const or = (...items: Matcher[]): Matcher => ({ type: 'or', items });
export const not = (item: Matcher): Matcher => ({ type: 'not', item });

/** Video default: no shorts, and nothing older than 90 days (older files are removed). */
export const DEFAULT_VIDEO_MATCHER: Matcher = and(
  not({ type: 'is_short' }),
  not({ type: 'older_than_days', days: 90 }),
);
/** Music default: the empty `and`, which matches everything (an artist's every release). */
export const DEFAULT_MUSIC_MATCHER: Matcher = and();

// ---------------------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------------------

/** What a tree is evaluated against: one fetched entry or one stored item. */
export interface MatcherContext {
  title: string | null;
  isShort: boolean;
  /** `YYYY-MM-DD` or an ISO timestamp; only the UTC day counts. null is unknown. */
  publishedAt: string | null;
  durationSeconds: number | null;
  /** yt-dlp's `live_status`; null counts as `not_live`. */
  liveStatus: string | null;
  /** The uploader. For a channel's own listing, the channel itself. */
  channelName: string | null;
  channelId: string | null;
  /** 1-based position in the playlist source; null outside playlists. */
  playlistPosition: number | null;
  now: Date;
}

export interface MatcherResult {
  matches: boolean;
  /**
   * When `matches` is false: the conditions that decided it, as chip-style labels with their
   * negation (`no shorts`, `not older than 90 days`, `only "Artemis"`). For history details
   * and the rules preview.
   */
  failing?: string[];
}

type Truth = 'T' | 'F' | 'U';
interface Outcome {
  value: Truth;
  /** Labels of the conditions that decided `value` (for T and F). */
  why: string[];
}

const DAY_MS = 86_400_000;

/**
 * Evaluates a tree against one item. Pure: the clock is `ctx.now`. See the file comment for
 * empty gates and unknown data.
 */
export function evaluateMatcher(matcher: Matcher, ctx: MatcherContext): MatcherResult {
  const outcome = evaluate(matcher, ctx, false);
  if (outcome.value === 'F') return { matches: false, failing: unique(outcome.why) };
  return { matches: true };
}

function evaluate(node: Matcher, ctx: MatcherContext, negated: boolean): Outcome {
  switch (node.type) {
    case 'and':
    case 'or': {
      const results = node.items.map((item) => evaluate(item, ctx, negated));
      const decisive: Truth = node.type === 'and' ? 'F' : 'T';
      const hits = results.filter((result) => result.value === decisive);
      if (hits.length > 0) return { value: decisive, why: hits.flatMap((hit) => hit.why) };
      if (results.some((result) => result.value === 'U')) return { value: 'U', why: [] };
      // All items agree on the other value (or there are none: and() is T, or() is F).
      return { value: decisive === 'F' ? 'T' : 'F', why: results.flatMap((result) => result.why) };
    }
    case 'not': {
      const inner = evaluate(node.item, ctx, !negated);
      return { value: inner.value === 'U' ? 'U' : inner.value === 'T' ? 'F' : 'T', why: inner.why };
    }
    default: {
      const value = leafValue(node, ctx);
      return { value, why: value === 'U' ? [] : [describeLeaf(node, negated)] };
    }
  }
}

const truth = (value: boolean): Truth => (value ? 'T' : 'F');

function leafValue(leaf: MatcherLeaf, ctx: MatcherContext): Truth {
  switch (leaf.type) {
    case 'title_contains':
      return truth(ctx.title !== null && ctx.title.toLowerCase().includes(leaf.text.toLowerCase()));
    case 'title_matches': {
      const regex = compile(leaf.pattern);
      return truth(ctx.title !== null && regex !== null && regex.test(ctx.title));
    }
    case 'is_short':
      return truth(ctx.isShort);
    case 'published_before':
    case 'published_after':
    case 'older_than_days': {
      const day = dayOf(ctx.publishedAt);
      if (day === null) return 'U';
      if (leaf.type === 'published_before') return truth(day < leaf.date);
      if (leaf.type === 'published_after') return truth(day >= leaf.date);
      return truth(day < daysAgo(ctx.now, leaf.days));
    }
    case 'duration_under':
    case 'duration_over':
      if (ctx.durationSeconds === null) return 'U';
      return truth(
        leaf.type === 'duration_under'
          ? ctx.durationSeconds < leaf.seconds
          : ctx.durationSeconds > leaf.seconds,
      );
    case 'live_status':
      return truth((ctx.liveStatus ?? 'not_live') === leaf.status);
    case 'channel_is': {
      if (ctx.channelId === null && ctx.channelName === null) return 'U';
      const wanted = leaf.channel.trim();
      return truth(
        ctx.channelId === wanted ||
          (ctx.channelName !== null &&
            ctx.channelName.trim().toLowerCase() === wanted.toLowerCase()),
      );
    }
    default:
      // in_playlist_position_under
      if (ctx.playlistPosition === null) return 'U';
      return truth(ctx.playlistPosition < leaf.position);
  }
}

/** The oldest upload day (`YYYY-MM-DD`, UTC) that is not older than `days` days at `now`. */
export function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

function dayOf(publishedAt: string | null): string | null {
  if (!publishedAt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) return publishedAt;
  const time = Date.parse(publishedAt);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}

const regexCache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  let regex = regexCache.get(pattern);
  if (regex === undefined) {
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      regex = null;
    }
    if (regexCache.size > 500) regexCache.clear();
    regexCache.set(pattern, regex);
  }
  return regex;
}

function unique(labels: string[]): string[] {
  return [...new Set(labels)];
}

// ---------------------------------------------------------------------------------------
// Chips.
// ---------------------------------------------------------------------------------------

/** Live status labels for chips and the builder. */
export const LIVE_STATUS_LABELS: Record<LiveStatus, string> = {
  not_live: 'not a stream',
  is_live: 'live now',
  was_live: 'past stream',
  is_upcoming: 'upcoming',
  post_live: 'stream processing',
};

/** `45 s`, `10 min`, `1 h 30 min`. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (rest > 0) parts.push(`${rest} s`);
  return parts.join(' ');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One condition as a short label, `negated` when it sits under an odd number of `not`s:
 * `only "Artemis"` / `not "Artemis"`, `only shorts` / `no shorts`, `since 2026-01-01` /
 * `before 2026-01-01`, `older than 90 days` / `not older than 90 days`, `regex /live/`.
 */
export function describeLeaf(leaf: MatcherLeaf, negated = false): string {
  switch (leaf.type) {
    case 'title_contains':
      return negated ? `not "${leaf.text}"` : `only "${leaf.text}"`;
    case 'title_matches':
      return negated ? `not /${leaf.pattern}/` : `regex /${leaf.pattern}/`;
    case 'is_short':
      return negated ? 'no shorts' : 'only shorts';
    case 'published_before':
      return negated ? `since ${leaf.date}` : `before ${leaf.date}`;
    case 'published_after':
      return negated ? `before ${leaf.date}` : `since ${leaf.date}`;
    case 'older_than_days':
      return `${negated ? 'not ' : ''}older than ${plural(leaf.days, 'day')}`;
    case 'duration_under':
      return `${negated ? 'not ' : ''}under ${formatDuration(leaf.seconds)}`;
    case 'duration_over':
      return `${negated ? 'not ' : ''}over ${formatDuration(leaf.seconds)}`;
    case 'live_status':
      return `${negated ? 'not ' : ''}${LIVE_STATUS_LABELS[leaf.status]}`;
    case 'channel_is':
      return `${negated ? 'not ' : ''}by "${leaf.channel}"`;
    default:
      // in_playlist_position_under
      return `${negated ? 'not ' : ''}first ${leaf.position - 1} ${leaf.position === 2 ? 'entry' : 'entries'}`;
  }
}

/**
 * The rule chips for a tree (Channels rows, channel page): one chip per item of the root `and`
 * (nested `and`s are flattened into it), otherwise one chip for the whole tree. An `or` is one
 * chip with its items joined (`only "Artemis" or "Orion"`); deeper groups are parenthesised. An
 * empty root `and` (match everything) has no chips.
 */
export function describeMatcher(matcher: Matcher): string[] {
  if (matcher.type === 'and') return matcher.items.flatMap(describeMatcher);
  if (matcher.type === 'or' && matcher.items.length === 0) return ['nothing'];
  return [phrase(matcher, false)];
}

/**
 * A negated group, as the builder names it: `none of (a, b)` for `not(or)`, `not all of (a, b)`
 * for `not(and)`; titles read `no "A" or "B"`. A `not` around a `not` cancels out.
 */
function negatedGroup(group: MatcherGate): string {
  if (group.type === 'not') return phrase(group.item, true);
  const [first] = group.items;
  if (group.items.length === 1 && first) {
    return isGate(first) ? negatedGroup(first) : describeLeaf(first, true);
  }
  if (group.items.length === 0) return group.type === 'and' ? 'nothing' : 'everything';
  const titles = group.items.flatMap((item) =>
    item.type === 'title_contains' ? [`"${item.text}"`] : [],
  );
  if (group.type === 'or' && titles.length === group.items.length) {
    return `no ${titles.join(' or ')}`;
  }
  const items = group.items.map((item) => phrase(item, true)).join(', ');
  return group.type === 'or' ? `none of (${items})` : `not all of (${items})`;
}

function phrase(node: Matcher, nested: boolean): string {
  switch (node.type) {
    case 'and':
    case 'or': {
      if (node.items.length === 0) return node.type === 'and' ? 'everything' : 'nothing';
      const [first] = node.items;
      if (node.items.length === 1 && first) return phrase(first, nested);
      const titles = node.items.flatMap((item) =>
        item.type === 'title_contains' ? [`"${item.text}"`] : [],
      );
      const text =
        node.type === 'or' && titles.length === node.items.length
          ? `only ${titles.join(' or ')}`
          : node.items.map((item) => phrase(item, true)).join(` ${node.type} `);
      return nested ? `(${text})` : text;
    }
    case 'not':
      return isGate(node.item) ? negatedGroup(node.item) : describeLeaf(node.item, true);
    default:
      return describeLeaf(node);
  }
}
