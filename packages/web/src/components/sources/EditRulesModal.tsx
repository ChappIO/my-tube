import type { Source } from '@mytube/shared';
import { useState } from 'react';
import { apiErrorMessage } from '../../api/client';
import { useSettings } from '../../api/settings';
import { useUpdateSource } from '../../api/sources';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { RuleRows } from './RuleRows';
import { FALLBACK_KEEP_DAYS, draftFromRules, rulesFromDraft } from './rules-draft';
import { StatusLine } from './SourceBits';

export interface EditRulesModalProps {
  source: Source;
  onClose: () => void;
}

/**
 * "Rules for <name>": the Add modal's rule rows for the source's library, with Cancel and Save
 * (`PATCH /api/sources/:id`). Render it only while open so it starts from the saved rules.
 * Shared by the Channels rows and the channel page.
 */
export function EditRulesModal({ source, onClose }: EditRulesModalProps) {
  const settings = useSettings();
  const update = useUpdateSource();
  const [draft, setDraft] = useState(() =>
    draftFromRules(source.rules, settings.data?.video.keepDays ?? FALLBACK_KEEP_DAYS),
  );
  const result = rulesFromDraft(draft, source.kind);

  function save() {
    if (!result.ok) return;
    update.mutate({ id: source.id, patch: { rules: result.rules } }, { onSuccess: onClose });
  }

  let note: string | undefined;
  if (update.isError) note = apiErrorMessage(update.error, 'Could not save the rules.');
  else if (!result.ok) note = result.error;

  return (
    <Modal open onClose={onClose} title={`Rules for ${source.name}`}>
      <RuleRows draft={draft} onChange={setDraft} kind={source.kind} />
      <div className="grid gap-2">
        <StatusLine>{note}</StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!result.ok || update.isPending}
            onClick={save}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}
