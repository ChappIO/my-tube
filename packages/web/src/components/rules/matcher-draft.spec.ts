import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_VIDEO_MATCHER,
  MATCHER_MAX_DEPTH,
  type Matcher,
  and,
  not,
  or,
} from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import {
  type DraftGroup,
  type DraftLeaf,
  addNode,
  canAddGroup,
  draftFromMatcher,
  groupHint,
  leafOptions,
  matcherFromDraft,
  moveNode,
  newGroup,
  newLeaf,
  nodeError,
  removeNode,
  setGate,
  setNegated,
  updateLeaf,
} from './matcher-draft';

const roundTrip = (matcher: Matcher) => matcherFromDraft(draftFromMatcher(matcher));
const artemis = { type: 'title_contains', text: 'Artemis' } as const;
const orion = { type: 'title_contains', text: 'Orion' } as const;

function firstLeaf(group: DraftGroup): DraftLeaf {
  const [leaf] = group.items;
  if (!leaf || leaf.kind !== 'leaf') throw new Error('expected a leaf');
  return leaf;
}

describe('draftFromMatcher / matcherFromDraft', () => {
  it.each([
    ['the video default', DEFAULT_VIDEO_MATCHER],
    ['the music default (empty and)', DEFAULT_MUSIC_MATCHER],
    [
      'a nested rule',
      and(
        not({ type: 'is_short' }),
        or(artemis, orion),
        not({ type: 'older_than_days', days: 90 }),
      ),
    ],
    ['a none-of group', and(not(or(artemis, orion)))],
    ['a negated and', and(not(and(artemis, { type: 'is_short' })))],
    [
      'every value kind',
      and(
        { type: 'title_matches', pattern: '\\blive\\b' },
        { type: 'published_before', date: '2026-01-01' },
        { type: 'published_after', date: '2025-01-01' },
        { type: 'duration_under', seconds: 60 },
        { type: 'duration_over', seconds: 0 },
        { type: 'live_status', status: 'was_live' },
        { type: 'channel_is', channel: 'NASA' },
        { type: 'in_playlist_position_under', position: 11 },
      ),
    ],
  ])('round-trips %s', (_name, matcher) => {
    expect(roundTrip(matcher)).toEqual({ ok: true, matcher });
  });

  it('wraps a lone condition or an or at the root in a group', () => {
    expect(roundTrip({ type: 'is_short' })).toEqual({
      ok: true,
      matcher: and({ type: 'is_short' }),
    });
    expect(roundTrip(or(artemis, orion))).toEqual({ ok: true, matcher: or(artemis, orion) });
    expect(draftFromMatcher(not(or(artemis, orion)))).toMatchObject({ gate: 'or', negated: true });
    expect(roundTrip(not(or(artemis, orion)))).toEqual({
      ok: true,
      matcher: not(or(artemis, orion)),
    });
  });

  it('shows a not around a group as the group toggle and around a leaf as the leaf toggle', () => {
    const root = draftFromMatcher(and(not(and(artemis, orion)), not(artemis)));
    const [group, leaf] = root.items;
    expect(group).toMatchObject({ kind: 'group', gate: 'and', negated: true });
    expect(leaf).toMatchObject({ kind: 'leaf', type: 'title_contains', negated: true });
  });

  it('collapses double negations', () => {
    expect(roundTrip(and(not(not({ type: 'is_short' }))))).toEqual({
      ok: true,
      matcher: and({ type: 'is_short' }),
    });
    expect(roundTrip(and(not(not(not(or(artemis, orion))))))).toEqual({
      ok: true,
      matcher: and(not(or(artemis, orion))),
    });
    expect(draftFromMatcher(not(not(and(artemis))))).toMatchObject({ negated: false });
  });

  it('keeps every parameter when the type changes, and trims texts', () => {
    const root = draftFromMatcher(and({ ...artemis, text: '  Artemis ' }));
    const id = firstLeaf(root).id;
    const asDays = updateLeaf(root, id, { type: 'older_than_days', days: 30 });
    expect(matcherFromDraft(asDays)).toEqual({
      ok: true,
      matcher: and({ type: 'older_than_days', days: 30 }),
    });
    const back = updateLeaf(asDays, id, { type: 'title_contains' });
    expect(matcherFromDraft(back)).toEqual({ ok: true, matcher: and(artemis) });
  });
});

describe('validation', () => {
  it('allows an empty root and, but not an empty root or or nested group', () => {
    expect(matcherFromDraft(draftFromMatcher(and()))).toEqual({ ok: true, matcher: and() });
    expect(matcherFromDraft(draftFromMatcher(or()))).toMatchObject({ ok: false });
    const nested = draftFromMatcher(and(or(artemis)));
    const group = nested.items[0];
    if (group?.kind !== 'group') throw new Error('expected a group');
    const emptied = removeNode(nested, firstLeaf(group).id);
    expect(matcherFromDraft(emptied)).toEqual({
      ok: false,
      error: 'Add a condition to this group or remove it.',
    });
  });

  it('reports empty fields, bad regexes and ranges', () => {
    const leaf = newLeaf();
    expect(nodeError(leaf)).toBe('Enter the text titles must contain.');
    expect(nodeError({ ...leaf, type: 'title_matches', pattern: '([' })).toMatch(
      /^Not a valid regular expression/,
    );
    expect(nodeError({ ...leaf, type: 'published_after', date: '' })).toBe('Pick a date.');
    expect(nodeError({ ...leaf, type: 'older_than_days', days: 0 })).toBe(
      'Use 1 to 3650 for days.',
    );
    expect(nodeError({ ...leaf, type: 'is_short' })).toBeUndefined();
  });

  it('refuses playlist-only conditions outside playlists and hides them from the select', () => {
    const root = draftFromMatcher(and({ type: 'channel_is', channel: 'NASA' }));
    expect(matcherFromDraft(root, { playlist: false })).toEqual({
      ok: false,
      error: 'This condition only applies to playlists.',
    });
    expect(matcherFromDraft(root, { playlist: true }).ok).toBe(true);
    expect(leafOptions(false).map((o) => o.value)).not.toContain('channel_is');
    expect(leafOptions(true).map((o) => o.value)).toContain('in_playlist_position_under');
  });

  it('stops offering groups before the depth limit', () => {
    let root = draftFromMatcher(and());
    let groupId = root.id;
    let levels = 1;
    while (canAddGroup(root, groupId)) {
      const group = newGroup('and');
      root = addNode(root, groupId, group);
      groupId = group.id;
      levels++;
    }
    expect(levels).toBeLessThan(MATCHER_MAX_DEPTH);
    // The deepest tree the builder allows still saves, with NOT on every condition.
    const leaves: string[] = [];
    (function collect(node: DraftGroup) {
      for (const item of node.items) {
        if (item.kind === 'group') collect(item);
        else leaves.push(item.id);
      }
    })(root);
    const negated = leaves.reduce(
      (tree, id) => updateLeaf(tree, id, { text: 'x', negated: true }),
      root,
    );
    expect(matcherFromDraft(negated).ok).toBe(true);
  });
});

describe('edits', () => {
  it('adds, removes, moves and regates without touching other nodes', () => {
    let root = draftFromMatcher(and(artemis));
    const untouched = firstLeaf(root);
    const group = newGroup();
    root = addNode(root, root.id, group);
    root = addNode(root, group.id);
    expect(root.items).toHaveLength(2);
    expect(root.items[0]).toBe(untouched);

    root = setGate(root, group.id, 'and');
    root = setNegated(root, group.id, true);
    root = moveNode(root, group.id, -1);
    expect(root.items.map((item) => item.kind)).toEqual(['group', 'leaf']);
    expect(moveNode(root, group.id, -1)).toEqual(root);

    root = removeNode(root, group.id);
    expect(root.items).toEqual([untouched]);
    expect(removeNode(root, root.id)).toBe(root);
  });

  it('negates a group with its NOT toggle: none of / not all of these', () => {
    let root = draftFromMatcher(and(or(artemis, orion)));
    const group = root.items[0];
    if (group?.kind !== 'group') throw new Error('expected a group');
    root = setNegated(root, group.id, true);
    expect(matcherFromDraft(root)).toEqual({ ok: true, matcher: and(not(or(artemis, orion))) });
    root = setGate(root, group.id, 'and');
    expect(matcherFromDraft(root)).toEqual({ ok: true, matcher: and(not(and(artemis, orion))) });
    expect(groupHint('or', true)).toBe('none of these');
    expect(groupHint('and', true)).toBe('not all of these');
    expect(groupHint('or', false)).toBe('any of these');
    expect(groupHint('and', false)).toBe('all of these');
  });

  it('refuses an empty negated root (it would match nothing)', () => {
    const empty = draftFromMatcher(and());
    expect(matcherFromDraft(setNegated(empty, empty.id, true)).ok).toBe(false);
  });

  it('negates a single condition with its NOT toggle', () => {
    const root = draftFromMatcher(and({ type: 'is_short' }));
    const flipped = updateLeaf(root, firstLeaf(root).id, { negated: true });
    expect(matcherFromDraft(flipped)).toEqual({
      ok: true,
      matcher: and(not({ type: 'is_short' })),
    });
  });
});
