import type { Matcher } from '@mytube/shared';
import { useState } from 'react';
import { MatcherBuilder } from '../rules/MatcherBuilder';
import { draftFromMatcher, matcherFromDraft } from '../rules/matcher-draft';
import { Button } from '../ui/Button';
import { ModalActions } from '../ui/Modal';
import { SettingsNote } from '../ui/SettingsCard';

export interface DefaultRulesEditorProps {
  /** The saved default tree (`video.defaultRules` / `music.defaultRules`). */
  value: Matcher;
  onSave: (matcher: Matcher) => void;
  /** Who starts from these rules, for the note ("channels and playlists"). */
  appliesTo: string;
}

/**
 * A library's default rules in Settings, edited with the same builder as the Add and Edit
 * modals. Unlike the other settings it does not save on every change (a half-built tree is not
 * valid): Save and Revert appear once the tree differs from the saved one. Playlist-only
 * conditions are not offered, because the defaults also seed channels and artists.
 */
export function DefaultRulesEditor({ value, onSave, appliesTo }: DefaultRulesEditorProps) {
  const [draft, setDraft] = useState(() => draftFromMatcher(value));
  const result = matcherFromDraft(draft, { playlist: false });
  const dirty = !result.ok || JSON.stringify(result.matcher) !== JSON.stringify(value);
  return (
    <>
      <MatcherBuilder value={draft} onChange={setDraft} playlist={false} label="Default rules" />
      <SettingsNote size="small">
        New {appliesTo} start from these rules; each keeps its own copy. Files a source&apos;s rules
        no longer match are removed.
      </SettingsNote>
      {dirty && (
        <>
          {!result.ok && (
            <SettingsNote role="status" size="small">
              {result.error}
            </SettingsNote>
          )}
          <ModalActions>
            <Button variant="outlined" onClick={() => setDraft(draftFromMatcher(value))}>
              Revert
            </Button>
            <Button
              variant="primary"
              disabled={!result.ok}
              onClick={() => result.ok && onSave(result.matcher)}
            >
              Save default rules
            </Button>
          </ModalActions>
        </>
      )}
    </>
  );
}
