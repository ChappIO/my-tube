import { MATCHER_TEXT_MAX } from '@mytube/shared';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { AddConditionIcon, AddGroupIcon, CloseIcon } from '../icons';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { NumberInput } from '../ui/NumberInput';
import { Select } from '../ui/Select';
import { TabPills } from '../ui/TabPills';
import { cx, focusRing, hitArea, minHit } from '../ui/cx';
import { FieldLabel, Meta } from '../ui/typography';
import {
  type DraftGate,
  type DraftGroup,
  type DraftLeaf,
  GATE_LABELS,
  groupHint,
  LIVE_STATUS_OPTIONS,
  addNode,
  canAddGroup,
  leafOptions,
  newGroup,
  newLeaf,
  nodeError,
  removeNode,
  setGate,
  setNegated,
  updateLeaf,
} from './matcher-draft';

export interface MatcherBuilderProps {
  /** The draft (`draftFromMatcher`); turn it into a matcher with `matcherFromDraft`. */
  value: DraftGroup;
  onChange: (next: DraftGroup) => void;
  /** Offer the playlist-only conditions (uploader, playlist position). */
  playlist: boolean;
  /** The group's visible label. */
  label?: string;
}

const gateItems = (['and', 'or'] as const).map((gate) => ({ id: gate, label: GATE_LABELS[gate] }));

/**
 * The rule builder: one nested group of conditions (a matcher tree). Each group has a NOT
 * toggle and an AND / OR pill track (all of / any of; with NOT: not all of / none of), its items
 * indented behind a left `line` border, and "Condition" / "Group" outlined buttons to add to it;
 * nested groups and conditions have a × to remove them. A condition is a NOT toggle, a type
 * select and its value (text, regex, date, days, seconds, live status, channel, position). Adding moves focus to
 * the new condition's type, removing to the group's add button. Controlled: `value` in,
 * `onChange` out.
 */
export function MatcherBuilder({
  value,
  onChange,
  playlist,
  label = 'Rules',
}: MatcherBuilderProps) {
  const labelId = useId();
  const scope = useId();
  // The element to focus after an add or remove, once the change has rendered.
  const focusTarget = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusTarget.current) return;
    document.getElementById(focusTarget.current)?.focus();
    focusTarget.current = undefined;
  });

  const ctx: BuilderContext = {
    root: value,
    playlist,
    domId: (id, part) => `${scope}-${id}-${part}`,
    change: onChange,
    focus: (id) => {
      focusTarget.current = id;
    },
  };
  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2">
      <FieldLabel as="div" id={labelId}>
        {label}
      </FieldLabel>
      <GroupNode group={value} ctx={ctx} root />
    </div>
  );
}

interface BuilderContext {
  root: DraftGroup;
  playlist: boolean;
  domId: (id: string, part: string) => string;
  change: (next: DraftGroup) => void;
  focus: (domId: string) => void;
}

function GroupNode({
  group,
  ctx,
  root = false,
  parentId,
}: {
  group: DraftGroup;
  ctx: BuilderContext;
  root?: boolean;
  parentId?: string;
}) {
  const error = nodeError(group, { root });
  const errorId = ctx.domId(group.id, 'error');
  const gate = GATE_LABELS[group.gate];
  const hint = groupHint(group.gate, group.negated);
  const addCondition = () => {
    const leaf = newLeaf();
    ctx.change(addNode(ctx.root, group.id, leaf));
    ctx.focus(ctx.domId(leaf.id, 'type'));
  };
  const addGroup = () => {
    const nested = newGroup();
    ctx.change(addNode(ctx.root, group.id, nested));
    const [first] = nested.items;
    if (first) ctx.focus(ctx.domId(first.id, 'type'));
  };
  return (
    <div
      role="group"
      aria-label={`${group.negated ? 'NOT ' : ''}${gate} group: ${hint}`}
      aria-describedby={error ? errorId : undefined}
      className="grid min-w-0 gap-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <NotToggle
          pressed={group.negated}
          label={`NOT: this ${gate} group`}
          onChange={(negated) => ctx.change(setNegated(ctx.root, group.id, negated))}
        />
        <TabPills
          size="sm"
          label="Match"
          items={gateItems}
          value={group.gate}
          onChange={(next: DraftGate) => ctx.change(setGate(ctx.root, group.id, next))}
        />
        <Meta>{hint}</Meta>
        {!root && parentId && (
          <IconButton
            size="sm"
            label="Remove group"
            className="ml-auto"
            onClick={() => {
              ctx.change(removeNode(ctx.root, group.id));
              ctx.focus(ctx.domId(parentId, 'add'));
            }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </div>
      <div className="ml-[9px] grid min-w-0 gap-2 border-l-2 border-line pl-3">
        {group.items.map((item) =>
          item.kind === 'group' ? (
            <GroupNode key={item.id} group={item} ctx={ctx} parentId={group.id} />
          ) : (
            <LeafRow key={item.id} leaf={item} ctx={ctx} groupId={group.id} />
          ),
        )}
        {root && group.items.length === 0 && group.gate === 'and' && !group.negated && (
          <Meta as="p">No conditions: everything is downloaded and kept.</Meta>
        )}
        {error && (
          <Meta as="p" tone="red" id={errorId}>
            {error}
          </Meta>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            id={ctx.domId(group.id, 'add')}
            variant="outlined"
            icon={<AddConditionIcon />}
            aria-label={`Add a condition to this ${gate} group`}
            onClick={addCondition}
          >
            Condition
          </Button>
          {canAddGroup(ctx.root, group.id) && (
            <Button
              variant="outlined"
              icon={<AddGroupIcon />}
              aria-label={`Add a nested group to this ${gate} group`}
              onClick={addGroup}
            >
              Group
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LeafRow({
  leaf,
  ctx,
  groupId,
}: {
  leaf: DraftLeaf;
  ctx: BuilderContext;
  groupId: string;
}) {
  const set = (patch: Partial<DraftLeaf>) => ctx.change(updateLeaf(ctx.root, leaf.id, patch));
  const options = leafOptions(ctx.playlist || leafNeedsPlaylist(leaf));
  const typeLabel = options.find((option) => option.value === leaf.type)?.label ?? leaf.type;
  const error = nodeError(leaf, { playlist: ctx.playlist });
  // Empty fields are reported under the modal (the Save button says why it is off); inline
  // messages are for values that are wrong, not missing.
  const shown = error && !isMissing(leaf) ? error : undefined;
  const errorId = ctx.domId(leaf.id, 'error');
  return (
    <div className="grid min-w-0 gap-1">
      {/* NOT, then the type and its value (the value wraps under the type when the row is
          too narrow), then × pinned to the top right. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
        <FirstLine>
          <NotToggle
            pressed={leaf.negated}
            label={`NOT: ${typeLabel}`}
            onChange={(negated) => set({ negated })}
          />
        </FirstLine>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            id={ctx.domId(leaf.id, 'type')}
            label="Condition"
            options={options}
            value={leaf.type}
            onChange={(type) => set({ type })}
            className="min-w-0"
          />
          <LeafValue leaf={leaf} set={set} invalid={shown ? errorId : undefined} />
        </div>
        <FirstLine>
          <IconButton
            size="sm"
            label={`Remove condition: ${typeLabel}`}
            onClick={() => {
              ctx.change(removeNode(ctx.root, leaf.id));
              ctx.focus(ctx.domId(groupId, 'add'));
            }}
          >
            <CloseIcon />
          </IconButton>
        </FirstLine>
      </div>
      {shown && (
        <Meta as="p" tone="red" id={errorId}>
          {shown}
        </Meta>
      )}
    </div>
  );
}

/** Centres a small control on the first line of a condition row (the height of a select). */
function FirstLine({ children }: { children: ReactNode }) {
  return <div className={cx('flex items-center', minHit)}>{children}</div>;
}

/** A playlist-only condition that is already in the tree stays selectable, flagged invalid. */
function leafNeedsPlaylist(leaf: DraftLeaf): boolean {
  return leaf.type === 'channel_is' || leaf.type === 'in_playlist_position_under';
}

function isMissing(leaf: DraftLeaf): boolean {
  if (leaf.type === 'title_contains') return !leaf.text.trim();
  if (leaf.type === 'title_matches') return !leaf.pattern.trim();
  if (leaf.type === 'channel_is') return !leaf.channel.trim();
  if (leaf.type === 'published_after' || leaf.type === 'published_before') return !leaf.date;
  return false;
}

/** The value control of a condition; nothing for "Is a short" and "Is members-only". */
function LeafValue({
  leaf,
  set,
  invalid,
}: {
  leaf: DraftLeaf;
  set: (patch: Partial<DraftLeaf>) => void;
  /** Id of the message describing what is wrong, when something is. */
  invalid?: string;
}) {
  const text = (value: string, patch: (value: string) => Partial<DraftLeaf>, props: TextProps) => (
    <ValueSlot>
      <Input
        shape="value"
        maxLength={MATCHER_TEXT_MAX}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid}
        className="w-full aria-invalid:text-red wide:min-w-48"
        onChange={(event) => set(patch(event.target.value))}
        {...props}
      />
    </ValueSlot>
  );
  switch (leaf.type) {
    case 'title_contains':
      return text(leaf.text, (value) => ({ text: value }), {
        'aria-label': 'Title text',
        placeholder: 'Artemis',
      });
    case 'title_matches':
      return text(leaf.pattern, (value) => ({ pattern: value }), {
        'aria-label': 'Regular expression',
        placeholder: '\\blive\\b',
        spellCheck: false,
      });
    case 'channel_is':
      return text(leaf.channel, (value) => ({ channel: value }), {
        'aria-label': 'Channel name or id',
        placeholder: 'NASA',
      });
    case 'published_after':
    case 'published_before':
      return (
        <ValueSlot>
          <Input
            shape="value"
            type="date"
            aria-label={leaf.type === 'published_after' ? 'On or after' : 'Before'}
            value={leaf.date}
            onChange={(event) => set({ date: event.target.value })}
          />
        </ValueSlot>
      );
    case 'older_than_days':
      return (
        <ValueSlot unit="days">
          <NumberInput
            label="Days"
            min={1}
            max={3650}
            value={leaf.days}
            onChange={(days) => set({ days })}
          />
        </ValueSlot>
      );
    case 'duration_under':
    case 'duration_over':
      return (
        <ValueSlot unit="seconds">
          <NumberInput
            label="Seconds"
            min={leaf.type === 'duration_under' ? 1 : 0}
            max={86_400}
            value={leaf.seconds}
            onChange={(seconds) => set({ seconds })}
          />
        </ValueSlot>
      );
    case 'in_playlist_position_under':
      return (
        <ValueSlot>
          <NumberInput
            label="Position"
            min={2}
            max={100_000}
            value={leaf.position}
            onChange={(position) => set({ position })}
          />
        </ValueSlot>
      );
    case 'live_status':
      return (
        <ValueSlot>
          <Select
            label="Live status"
            options={LIVE_STATUS_OPTIONS}
            value={leaf.status}
            onChange={(status) => set({ status })}
          />
        </ValueSlot>
      );
    default:
      return null;
  }
}

type TextProps = {
  'aria-label': string;
  placeholder: string;
  spellCheck?: boolean;
};

/**
 * Where a condition's value goes: after the type when it fits, else on its own line under it
 * (always on narrow screens), with an optional unit after the box.
 */
function ValueSlot({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 wide:w-auto">
      <div className="min-w-0 flex-1 wide:flex-none">{children}</div>
      {unit && <Meta>{unit}</Meta>}
    </div>
  );
}

/**
 * The per-condition NOT: a small Space Mono pill that is a toggle button (`aria-pressed`). On,
 * it is red like a checked rule box; off, outlined and muted.
 */
function NotToggle({
  pressed,
  label,
  onChange,
}: {
  pressed: boolean;
  label: string;
  onChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={pressed ? 'Negated: matches when this does not' : 'Negate'}
      onClick={() => onChange(!pressed)}
      className={cx(
        'cursor-pointer rounded-pill border px-2 py-[3px] font-mono text-[11px] font-bold',
        hitArea,
        focusRing,
        pressed ? 'border-red bg-red text-white' : 'border-line text-muted',
      )}
    >
      NOT
    </button>
  );
}
