import { useId, useState } from 'react';
import { cx } from './cx';
import { Input } from './Input';
import { useFieldId } from './KeyValueGrid';
import { Meta } from './typography';

export interface TextValueInputProps {
  /** The saved text. An empty string shows the placeholder (for example "none"). */
  value: string;
  /** Called with the trimmed text when the user commits a valid change (blur or Enter). */
  onCommit: (text: string) => void;
  /** Returns an error message for trimmed text that cannot be saved, otherwise undefined. */
  validate?: (text: string) => string | undefined;
  placeholder?: string;
  /** Defaults to the id of the surrounding `KeyValueRow`. */
  id?: string;
  /** Accessible name when there is no visible label. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Width bounds of the box on wide screens, in characters of Space Mono 13. */
const MIN_CHARS = 20;
const MAX_CHARS = 56;

/** The box width for a text: its length plus room for the caret, within the bounds. */
export function valueInputChars(text: string, placeholder = ''): number {
  const length = Math.max(text.length, placeholder.length) + 2;
  return Math.min(MAX_CHARS, Math.max(MIN_CHARS, length));
}

/**
 * Free text in the Settings value box (`Input shape="value"`, Space Mono): paths, templates,
 * rate limits. Unlike selects and toggles it saves on commit, not per keystroke, because partial
 * text is rarely valid: blur or Enter saves, Escape reverts. Invalid text stays in the box,
 * marked red with the message under it, until it is fixed or reverted. On wide screens the box
 * grows with its text (20 to 56 characters); on narrow ones it is full width.
 */
export function TextValueInput({
  value,
  onCommit,
  validate,
  placeholder,
  id,
  label,
  disabled,
  className,
}: TextValueInputProps) {
  const fieldId = useFieldId(id);
  const errorId = useId();
  // The text being edited; undefined shows `value`.
  const [draft, setDraft] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  // A new saved value (the save landed, or rolled back) replaces the draft.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(undefined);
    setAttempted(false);
  }

  const text = draft ?? value;
  const error = attempted ? validate?.(text.trim()) : undefined;

  const commit = () => {
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (validate?.(trimmed) !== undefined) {
      setAttempted(true);
      return;
    }
    if (trimmed === value) {
      setDraft(undefined);
      setAttempted(false);
      return;
    }
    // Keep the draft on screen until the new value arrives, so the box does not flash back.
    onCommit(trimmed);
  };

  return (
    <div className={cx('grid justify-items-stretch gap-[6px] wide:justify-items-start', className)}>
      <Input
        shape="value"
        id={fieldId}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        spellCheck={false}
        autoComplete="off"
        chars={valueInputChars(text, placeholder)}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        className="aria-invalid:text-red disabled:opacity-50"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape' && draft !== undefined) {
            event.preventDefault();
            setDraft(undefined);
            setAttempted(false);
          }
        }}
      />
      {error && (
        <Meta as="p" tone="red" id={errorId}>
          {error}
        </Meta>
      )}
    </div>
  );
}
