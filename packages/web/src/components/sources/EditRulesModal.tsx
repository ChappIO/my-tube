import type { Matcher, Source } from '@mytube/shared';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { useSettings } from '../../api/settings';
import { useRulesPreview, useUpdateSource } from '../../api/sources';
import { useDebounced } from '../../use-debounced';
import { MatcherBuilder } from '../rules/MatcherBuilder';
import { RemovalNote, countFiles } from '../rules/RemovalNote';
import { SourceOptionRows } from '../rules/SourceOptionRows';
import { draftFromMatcher, matcherFromDraft } from '../rules/matcher-draft';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { StatusLine } from './SourceBits';

export interface EditRulesModalProps {
  source: Source;
  onClose: () => void;
}

/** How long the rules must stay unchanged before the removal preview is asked for. */
const PREVIEW_DELAY_MS = 300;

/**
 * "Rules for <name>": the rule builder with the source's tree, its options, and Cancel / Save
 * (`PATCH /api/sources/:id`). While the tree differs from the saved one, the API previews what
 * it would remove from disk; with removals, the note lists them and Save reads "Save and
 * remove N files". "Reset to library default" loads the library's default tree from Settings.
 * Render it only while open so it starts from the saved rules. Shared by the Channels rows and
 * the channel page.
 */
export function EditRulesModal({ source, onClose }: EditRulesModalProps) {
  const settings = useSettings();
  const update = useUpdateSource();
  const [draft, setDraft] = useState(() => draftFromMatcher(source.matcher));
  const [options, setOptions] = useState(source.options);
  const playlist = source.kind === 'playlist';
  const result = matcherFromDraft(draft, { playlist });

  const changed = result.ok && !sameTree(result.matcher, source.matcher);
  const candidate = useDebounced(
    changed && result.ok ? result.matcher : undefined,
    PREVIEW_DELAY_MS,
  );
  const preview = useRulesPreview(source.id, candidate);
  // The preview counts only while it is for the tree on screen.
  const current = changed && result.ok && sameTree(candidate, result.matcher) ? preview : undefined;
  const removals = current?.data?.wouldRemove.length ?? 0;
  const checking = changed && (!current || current.isPending);

  const libraryDefault = settings.data?.[source.library].defaultRules;
  function reset() {
    if (libraryDefault) setDraft(draftFromMatcher(libraryDefault));
  }

  function save() {
    if (!result.ok) return;
    update.mutate(
      {
        id: source.id,
        patch: {
          ...(changed && { matcher: result.matcher }),
          options: { embedCoverArt: options.embedCoverArt, syncOrder: options.syncOrder },
        },
      },
      { onSuccess: onClose },
    );
  }

  let note: string | undefined;
  if (update.isError) note = apiErrorMessage(update.error, 'Could not save the rules.');
  else if (!result.ok) note = result.error;
  else if (current?.isError) {
    note = apiErrorMessage(current.error, 'Could not check what these rules would remove.');
  }

  return (
    <Modal open onClose={onClose} title={`Rules for ${source.name}`}>
      <MatcherBuilder value={draft} onChange={setDraft} playlist={playlist} />
      <SourceOptionRows
        library={source.library}
        kind={source.kind}
        options={options}
        onChange={setOptions}
      />
      {current?.data && <RemovalNote preview={current.data} />}
      <div className="grid gap-2">
        <StatusLine>{note}</StatusLine>
        <ModalActions>
          {libraryDefault && (
            <Button variant="outlined" size="lg" className="mr-auto" onClick={reset}>
              Reset to library default
            </Button>
          )}
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!result.ok || update.isPending || checking || current?.isError}
            onClick={save}
          >
            {saveLabel(update.isPending, checking, removals)}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

function saveLabel(saving: boolean, checking: boolean, removals: number): string {
  if (saving) return 'Saving…';
  if (checking) return 'Checking…';
  if (removals > 0) return `Save and remove ${countFiles(removals)}`;
  return 'Save';
}

function sameTree(a: Matcher | undefined, b: Matcher | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
