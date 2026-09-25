import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal, ModalActions } from '../ui/Modal';
import { TextArea } from '../ui/TextArea';
import { FieldLabel, Meta } from '../ui/typography';

export interface CookiesPasteModalProps {
  open: boolean;
  onClose: () => void;
  /** Sends the text (`PUT /api/system/cookies`); the modal closes when the save succeeds. */
  onSave: (text: string) => void;
  saving: boolean;
  /** The API's answer to a failed save, shown under the text. */
  error?: string;
}

/** "Paste cookies": the text of an exported cookies file in a monospace box, then Save. */
export function CookiesPasteModal({
  open,
  onClose,
  onSave,
  saving,
  error,
}: CookiesPasteModalProps) {
  const [text, setText] = useState('');
  const fieldId = useId();
  const errorId = useId();
  return (
    <Modal open={open} onClose={onClose} title="Paste cookies">
      <div className="grid gap-2">
        <FieldLabel htmlFor={fieldId}>Contents of cookies.txt</FieldLabel>
        <TextArea
          id={fieldId}
          mono
          rows={10}
          placeholder="# Netscape HTTP Cookie File"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <div role="alert">
          {error && (
            <Meta as="p" tone="red" id={errorId}>
              {error}
            </Meta>
          )}
        </div>
      </div>
      <ModalActions>
        <Button variant="secondary" size="lg" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={saving || text.trim() === ''}
          onClick={() => onSave(text)}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </ModalActions>
    </Modal>
  );
}
