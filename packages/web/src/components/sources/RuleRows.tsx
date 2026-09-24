import { KEEP_DAYS_MAX, KEEP_DAYS_MIN, type SourceKind, TITLE_FILTER_MAX } from '@mytube/shared';
import { type ReactNode, useId } from 'react';
import { CheckboxRow } from '../ui/CheckboxRow';
import { Input } from '../ui/Input';
import { NumberInput } from '../ui/NumberInput';
import { FieldLabel } from '../ui/typography';
import type { RulesDraft, VideoRulesDraft } from './rules-draft';

export interface RuleRowsProps {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
  /** The source kind; playlists get the extra "Sync in playlist order" row. */
  kind: SourceKind;
}

/**
 * The "Rules" group of the Add and Edit rules modals (handoff Screen 4): a label and one
 * `CheckboxRow` per rule of the draft's library. Rows with a value reveal a small inline field
 * under them when checked (days to keep, title text, first date).
 */
export function RuleRows({ draft, onChange, kind }: RuleRowsProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2">
      <FieldLabel as="div" id={labelId}>
        Rules
      </FieldLabel>
      {draft.library === 'video' ? (
        <VideoRuleRows draft={draft} onChange={onChange} kind={kind} />
      ) : (
        <>
          <CheckboxRow
            label="Skip live recordings"
            hint={'title contains "live"'}
            checked={draft.skipLiveRecordings}
            onChange={(skipLiveRecordings) => onChange({ ...draft, skipLiveRecordings })}
          />
          <CheckboxRow
            label="Embed cover art"
            hint="from YouTube Music"
            checked={draft.embedCoverArt}
            onChange={(embedCoverArt) => onChange({ ...draft, embedCoverArt })}
          />
        </>
      )}
    </div>
  );
}

function VideoRuleRows({
  draft,
  onChange,
  kind,
}: {
  draft: VideoRulesDraft;
  onChange: (draft: VideoRulesDraft) => void;
  kind: SourceKind;
}) {
  const set = (patch: Partial<VideoRulesDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <CheckboxRow
        label="Skip shorts"
        hint="under 60 s"
        checked={draft.skipShorts}
        onChange={(skipShorts) => set({ skipShorts })}
      />
      <CheckboxRow
        label={`Keep only the last ${draft.keepDays} ${draft.keepDays === 1 ? 'day' : 'days'}`}
        hint="older files deleted"
        checked={draft.keep}
        onChange={(keep) => set({ keep })}
      />
      {draft.keep && (
        <InlineField>
          <NumberInput
            label="Days to keep"
            min={KEEP_DAYS_MIN}
            max={KEEP_DAYS_MAX}
            value={draft.keepDays}
            onChange={(keepDays) => set({ keepDays })}
          />
        </InlineField>
      )}
      <CheckboxRow
        label="Only titles matching"
        hint={draft.titleOn && draft.title.trim() ? `"${draft.title.trim()}"` : '"…"'}
        checked={draft.titleOn}
        onChange={(titleOn) => set({ titleOn })}
      />
      {draft.titleOn && (
        <InlineField>
          <Input
            shape="value"
            aria-label="Title contains"
            placeholder="Deep Dive"
            maxLength={TITLE_FILTER_MAX}
            // Revealed by ticking the row, so the text goes where the user is looking.
            autoFocus
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
          />
        </InlineField>
      )}
      <CheckboxRow
        label="Everything published after"
        hint={draft.afterOn && draft.after ? draft.after : 'YYYY-MM-DD'}
        checked={draft.afterOn}
        onChange={(afterOn) => set({ afterOn })}
      />
      {draft.afterOn && (
        <InlineField>
          <Input
            shape="value"
            type="date"
            aria-label="Published on or after"
            autoFocus
            value={draft.after}
            onChange={(event) => set({ after: event.target.value })}
          />
        </InlineField>
      )}
      {kind === 'playlist' && (
        <CheckboxRow
          label="Sync in playlist order"
          hint="numbered by position"
          checked={draft.syncOrder}
          onChange={(syncOrder) => set({ syncOrder })}
        />
      )}
    </>
  );
}

/** A checked row's inline field, indented to line up with the row's label. */
function InlineField({ children }: { children: ReactNode }) {
  return <div className="pr-3 pb-1 pl-11">{children}</div>;
}
