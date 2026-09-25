import {
  LIVE_STATUSES,
  LIVE_STATUS_LABELS,
  MATCHER_DAYS_MAX,
  MATCHER_DAYS_MIN,
  MATCHER_MAX_DEPTH,
  MATCHER_POSITION_MAX,
  MATCHER_SECONDS_MAX,
  MATCHER_TEXT_MAX,
  Matcher,
  PLAYLIST_ONLY_LEAVES,
  type LeafType,
  type LiveStatus,
  type MatcherLeaf,
  regexError,
} from '@mytube/shared';

/*
 * The rule builder's editing state. A draft is the matcher tree with ids on every node (React
 * keys, edit targets) and with every leaf keeping all its parameters, so switching a
 * condition's type and back does not lose what was typed. `matcherFromDraft` turns it into the
 * shared `Matcher` or says why it cannot be saved yet.
 *
 * Groups carry one gate, `and` (all of) or `or` (any of). Every node, group or condition, has a
 * NOT toggle (`negated`) that wraps it in `not`: a negated OR group reads "none of these", a
 * negated AND group "not all of these". There is no NOT gate: NOT over several children reads
 * badly and is expressible with the toggles. Loading a tree folds every `not` into the toggle
 * of the node it wraps, so double negations cancel. Only the root group may be empty, as a
 * plain AND (an empty `and` matches everything).
 */

export type DraftGate = 'and' | 'or';

export interface DraftGroup {
  kind: 'group';
  id: string;
  gate: DraftGate;
  /** Wrapped in `not`. */
  negated: boolean;
  items: DraftNode[];
}

export interface DraftLeaf {
  kind: 'leaf';
  id: string;
  type: LeafType;
  negated: boolean;
  /** Parameters of every leaf type; `type` decides which one counts. */
  text: string;
  pattern: string;
  date: string;
  days: number;
  seconds: number;
  status: LiveStatus;
  channel: string;
  position: number;
}

export type DraftNode = DraftGroup | DraftLeaf;

let lastId = 0;
function nextId(): string {
  lastId += 1;
  return `n${lastId}`;
}

/** Condition types in the builder's select, with their labels. */
export const LEAF_OPTIONS: readonly { value: LeafType; label: string }[] = [
  { value: 'title_contains', label: 'Title contains' },
  { value: 'title_matches', label: 'Title matches regex' },
  { value: 'is_short', label: 'Is a short' },
  { value: 'is_members_only', label: 'Is members-only' },
  { value: 'older_than_days', label: 'Older than' },
  { value: 'published_after', label: 'Published on or after' },
  { value: 'published_before', label: 'Published before' },
  { value: 'duration_under', label: 'Shorter than' },
  { value: 'duration_over', label: 'Longer than' },
  { value: 'live_status', label: 'Live status' },
  { value: 'channel_is', label: 'Uploaded by' },
  { value: 'in_playlist_position_under', label: 'Playlist position under' },
];

/** The select's options: playlist-only conditions appear for playlists only. */
export function leafOptions(playlist: boolean) {
  return LEAF_OPTIONS.filter((option) => playlist || !PLAYLIST_ONLY_LEAVES.includes(option.value));
}

export const LIVE_STATUS_OPTIONS: readonly { value: LiveStatus; label: string }[] =
  LIVE_STATUSES.map((status) => ({ value: status, label: LIVE_STATUS_LABELS[status] }));

export const GATE_LABELS: Record<DraftGate, string> = { and: 'AND', or: 'OR' };

/** What a group means, for its hint: all of / any of / none of / not all of these. */
export function groupHint(gate: DraftGate, negated: boolean): string {
  if (gate === 'and') return negated ? 'not all of these' : 'all of these';
  return negated ? 'none of these' : 'any of these';
}

/** A new condition: an empty "Title contains". */
export function newLeaf(type: LeafType = 'title_contains'): DraftLeaf {
  return {
    kind: 'leaf',
    id: nextId(),
    type,
    negated: false,
    text: '',
    pattern: '',
    date: '',
    days: 90,
    seconds: 60,
    status: 'was_live',
    channel: '',
    position: 11,
  };
}

/** A new group: "any of" with one empty condition (an empty nested group is not valid). */
export function newGroup(gate: DraftGate = 'or'): DraftGroup {
  return { kind: 'group', id: nextId(), gate, negated: false, items: [newLeaf()] };
}

// ---------------------------------------------------------------------------------------
// Matcher ⇄ draft.
// ---------------------------------------------------------------------------------------

/** The editable form of a tree. The root is always a group. */
export function draftFromMatcher(matcher: Matcher): DraftGroup {
  const node = toDraft(matcher);
  return node.kind === 'group'
    ? node
    : { kind: 'group', id: nextId(), gate: 'and', negated: false, items: [node] };
}

function toDraft(matcher: Matcher): DraftNode {
  switch (matcher.type) {
    case 'and':
    case 'or':
      return {
        kind: 'group',
        id: nextId(),
        gate: matcher.type,
        negated: false,
        items: matcher.items.map(toDraft),
      };
    case 'not': {
      // Fold the `not` into the toggle of what it wraps; not(not(x)) is x.
      const inner = toDraft(matcher.item);
      return { ...inner, negated: !inner.negated };
    }
    default:
      return leafDraft(matcher);
  }
}

function leafDraft(leaf: MatcherLeaf): DraftLeaf {
  const draft = newLeaf(leaf.type);
  switch (leaf.type) {
    case 'title_contains':
      return { ...draft, text: leaf.text };
    case 'title_matches':
      return { ...draft, pattern: leaf.pattern };
    case 'published_before':
    case 'published_after':
      return { ...draft, date: leaf.date };
    case 'older_than_days':
      return { ...draft, days: leaf.days };
    case 'duration_under':
    case 'duration_over':
      return { ...draft, seconds: leaf.seconds };
    case 'live_status':
      return { ...draft, status: leaf.status };
    case 'channel_is':
      return { ...draft, channel: leaf.channel };
    case 'in_playlist_position_under':
      return { ...draft, position: leaf.position };
    default:
      return draft;
  }
}

/** The leaf a draft stands for, without its NOT. Texts are trimmed. */
export function leafFromDraft(leaf: DraftLeaf): MatcherLeaf {
  switch (leaf.type) {
    case 'title_contains':
      return { type: leaf.type, text: leaf.text.trim() };
    case 'title_matches':
      return { type: leaf.type, pattern: leaf.pattern.trim() };
    case 'is_short':
    case 'is_members_only':
      return { type: leaf.type };
    case 'published_before':
    case 'published_after':
      return { type: leaf.type, date: leaf.date };
    case 'older_than_days':
      return { type: leaf.type, days: leaf.days };
    case 'duration_under':
    case 'duration_over':
      return { type: leaf.type, seconds: leaf.seconds };
    case 'live_status':
      return { type: leaf.type, status: leaf.status };
    case 'channel_is':
      return { type: leaf.type, channel: leaf.channel.trim() };
    default:
      return { type: 'in_playlist_position_under', position: leaf.position };
  }
}

function toMatcher(node: DraftNode): Matcher {
  if (node.kind === 'leaf') {
    const leaf = leafFromDraft(node);
    return node.negated ? { type: 'not', item: leaf } : leaf;
  }
  const group: Matcher = { type: node.gate, items: node.items.map(toMatcher) };
  return node.negated ? { type: 'not', item: group } : group;
}

// ---------------------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------------------

/** What is wrong with one node, for its inline message, or undefined. */
export function nodeError(
  node: DraftNode,
  { root = false, playlist = true }: { root?: boolean; playlist?: boolean } = {},
): string | undefined {
  if (node.kind === 'group') {
    if (node.items.length > 0) return undefined;
    if (root && node.gate === 'and' && !node.negated) return undefined;
    return root
      ? 'An empty group matches nothing. Add a condition, or use AND without NOT.'
      : 'Add a condition to this group or remove it.';
  }
  if (!playlist && PLAYLIST_ONLY_LEAVES.includes(node.type)) {
    return 'This condition only applies to playlists.';
  }
  switch (node.type) {
    case 'title_contains':
      return textError(node.text, 'Enter the text titles must contain.');
    case 'title_matches':
      return (
        textError(node.pattern, 'Enter a regular expression.') ?? regexError(node.pattern.trim())
      );
    case 'channel_is':
      return textError(node.channel, 'Enter a channel name or id.');
    case 'published_after':
    case 'published_before':
      return /^\d{4}-\d{2}-\d{2}$/.test(node.date) ? undefined : 'Pick a date.';
    case 'older_than_days':
      return inRange(node.days, MATCHER_DAYS_MIN, MATCHER_DAYS_MAX, 'days');
    case 'duration_under':
      return inRange(node.seconds, 1, MATCHER_SECONDS_MAX, 'seconds');
    case 'duration_over':
      return inRange(node.seconds, 0, MATCHER_SECONDS_MAX, 'seconds');
    case 'in_playlist_position_under':
      return inRange(node.position, 2, MATCHER_POSITION_MAX, 'the position');
    default:
      return undefined;
  }
}

function textError(text: string, empty: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return empty;
  if (trimmed.length > MATCHER_TEXT_MAX) return `Use at most ${MATCHER_TEXT_MAX} characters.`;
  return undefined;
}

function inRange(value: number, min: number, max: number, what: string): string | undefined {
  return Number.isInteger(value) && value >= min && value <= max
    ? undefined
    : `Use ${min} to ${max} for ${what}.`;
}

export type MatcherDraftResult = { ok: true; matcher: Matcher } | { ok: false; error: string };

/**
 * The tree a draft stands for, or the first reason it cannot be saved (an empty field, a bad
 * regex, an empty nested group, a playlist-only condition on a channel, the size limits).
 */
export function matcherFromDraft(
  root: DraftGroup,
  { playlist = true }: { playlist?: boolean } = {},
): MatcherDraftResult {
  const first = findError(root, true, playlist);
  if (first) return { ok: false, error: first };
  const parsed = Matcher.safeParse(toMatcher(root));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'These rules are not valid.' };
  }
  return { ok: true, matcher: parsed.data };
}

function findError(node: DraftNode, root: boolean, playlist: boolean): string | undefined {
  const own = nodeError(node, { root, playlist });
  if (own) return own;
  if (node.kind === 'leaf') return undefined;
  for (const item of node.items) {
    const error = findError(item, false, playlist);
    if (error) return error;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------
// Edits. Each returns a new root; nodes that did not change keep their identity.
// ---------------------------------------------------------------------------------------

/** Levels below the root a new group may still take (the root is level 1). */
export function canAddGroup(root: DraftGroup, groupId: string): boolean {
  const depth = depthOf(root, groupId, 1);
  // The group sits at `depth`; a new group is depth + 1 and its leaf depth + 2 (a leaf with
  // NOT counts one more).
  return depth !== undefined && depth + 3 <= MATCHER_MAX_DEPTH;
}

function depthOf(node: DraftNode, id: string, depth: number): number | undefined {
  if (node.id === id) return depth;
  if (node.kind === 'leaf') return undefined;
  for (const item of node.items) {
    // A negated node sits one level lower, under its `not`.
    const found = depthOf(item, id, depth + 1 + (item.negated ? 1 : 0));
    if (found !== undefined) return found;
  }
  return undefined;
}

function mapNode(node: DraftNode, id: string, change: (node: DraftNode) => DraftNode): DraftNode {
  if (node.id === id) return change(node);
  if (node.kind === 'leaf') return node;
  let changed = false;
  const items = node.items.map((item) => {
    const next = mapNode(item, id, change);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...node, items } : node;
}

function mapRoot(root: DraftGroup, id: string, change: (node: DraftNode) => DraftNode): DraftGroup {
  const next = mapNode(root, id, change);
  return next.kind === 'group' ? next : root;
}

/** Appends `node` (a new condition by default) to the group `groupId`. */
export function addNode(
  root: DraftGroup,
  groupId: string,
  node: DraftNode = newLeaf(),
): DraftGroup {
  return mapRoot(root, groupId, (group) =>
    group.kind === 'group' ? { ...group, items: [...group.items, node] } : group,
  );
}

/** Removes the node `id` (never the root). */
export function removeNode(root: DraftGroup, id: string): DraftGroup {
  if (root.id === id) return root;
  const strip = (group: DraftGroup): DraftGroup => {
    const items = group.items
      .filter((item) => item.id !== id)
      .map((item) => (item.kind === 'group' ? strip(item) : item));
    return { ...group, items };
  };
  return strip(root);
}

/** Moves the node `id` one place up (-1) or down (+1) within its group. */
export function moveNode(root: DraftGroup, id: string, offset: -1 | 1): DraftGroup {
  const move = (group: DraftGroup): DraftGroup => {
    const index = group.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      const target = index + offset;
      if (target < 0 || target >= group.items.length) return group;
      const items = [...group.items];
      const [node] = items.splice(index, 1);
      if (node) items.splice(target, 0, node);
      return { ...group, items };
    }
    return {
      ...group,
      items: group.items.map((item) => (item.kind === 'group' ? move(item) : item)),
    };
  };
  return move(root);
}

/** Changes a leaf's type or parameters (or its NOT). */
export function updateLeaf(
  root: DraftGroup,
  id: string,
  patch: Partial<Omit<DraftLeaf, 'kind' | 'id'>>,
): DraftGroup {
  return mapRoot(root, id, (node) => (node.kind === 'leaf' ? { ...node, ...patch } : node));
}

/** Changes a group's gate (AND / OR). */
export function setGate(root: DraftGroup, id: string, gate: DraftGate): DraftGroup {
  return mapRoot(root, id, (node) => (node.kind === 'group' ? { ...node, gate } : node));
}

/** Sets the NOT toggle of any node, group or condition (the root included). */
export function setNegated(root: DraftGroup, id: string, negated: boolean): DraftGroup {
  return mapRoot(root, id, (node) => ({ ...node, negated }));
}
