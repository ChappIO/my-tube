import { SUBTITLE_LANGUAGES_MAX } from '@mytube/shared';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { CloseIcon } from '../icons';
import { cx, focusRing, focusRingInset, minHit } from '../ui/cx';
import { useFieldId } from '../ui/KeyValueGrid';
import {
  type LanguageOption,
  languageKeyAction,
  languageName,
  languageOptions,
  withLanguage,
  withoutLanguage,
} from './language-select';

export interface LanguageMultiSelectProps {
  /** Picked language codes, in the order picked. */
  value: readonly string[];
  /** The new list, after every add or remove. */
  onChange: (codes: string[]) => void;
  /** Goes to the Add language button; defaults to the surrounding `KeyValueRow`'s id. */
  id?: string;
}

/**
 * Subtitle languages as removable chips (Space Mono code, Archivo name) in the Settings value
 * box, with an "Add language" button that opens a popover: a filter over `SUBTITLE_LANGUAGES`
 * and a list to pick from. A typed code outside the list can be added too. Every add and
 * remove reports the whole list right away; its order is the order picked.
 */
export function LanguageMultiSelect({ value, onChange, id }: LanguageMultiSelectProps) {
  const fieldId = useFieldId(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const full = value.length >= SUBTITLE_LANGUAGES_MAX;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    addRef.current?.focus();
  };

  return (
    <div ref={ref} className="relative w-full wide:w-auto">
      <div
        role="group"
        aria-label="Subtitle languages"
        className={cx(
          'box-border flex w-full flex-wrap items-center gap-[6px] rounded-[8px] bg-surface p-[5px] wide:w-max wide:max-w-[520px] wide:min-w-40',
          minHit,
        )}
      >
        {value.map((code) => (
          <LanguageChip
            key={code}
            code={code}
            onRemove={() => onChange(withoutLanguage(value, code))}
          />
        ))}
        {value.length === 0 && (
          <span className="px-[7px] font-mono text-[13px] text-muted">none</span>
        )}
        <button
          ref={addRef}
          id={fieldId}
          type="button"
          aria-label="Add language"
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={full}
          onClick={() => setOpen((current) => !current)}
          className={cx(
            'cursor-pointer rounded-chip px-2 py-[3px] font-sans text-[13px] font-semibold text-muted hover:bg-surface2 hover:text-ink disabled:cursor-default disabled:opacity-50',
            focusRing,
          )}
        >
          Add language
        </button>
      </div>
      {open && (
        <LanguagePopover
          selected={value}
          onAdd={(code) => onChange(withLanguage(value, code))}
          onRemoveLast={() => {
            const last = value.at(-1);
            if (last !== undefined) onChange(withoutLanguage(value, last));
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

/** One picked language: `en English` with a remove button. */
function LanguageChip({ code, onRemove }: { code: string; onRemove: () => void }) {
  const name = languageName(code);
  return (
    <span className="inline-flex items-center gap-[6px] rounded-chip border border-line bg-bg py-[2px] pr-[2px] pl-2 text-ink">
      <span className="font-mono text-[12px]">{code}</span>
      {name && <span className="font-sans text-[13px] font-medium">{name}</span>}
      <button
        type="button"
        aria-label={`Remove ${name || code}`}
        onClick={onRemove}
        className={cx(
          'grid size-5 cursor-pointer place-items-center rounded-badge text-muted hover:bg-surface2 hover:text-ink',
          focusRing,
        )}
      >
        <CloseIcon size={12} />
      </button>
    </span>
  );
}

export interface LanguagePopoverProps {
  selected: readonly string[];
  onAdd: (code: string) => void;
  onRemoveLast: () => void;
  onClose: () => void;
}

/**
 * The popover under the field (`bg`, `line` border, radius 12, padding 6, at least 240 wide and
 * never wider than the screen): the filter, then the languages not picked yet. The filter keeps
 * focus; ↑ ↓ move the highlight, Enter adds it, Backspace in an empty filter removes the last
 * chip, Escape closes. It stays open after an add, so several can be picked in a row.
 */
export function LanguagePopover({ selected, onAdd, onRemoveLast, onClose }: LanguagePopoverProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const options = languageOptions(query, selected);
  const active = Math.min(highlighted, Math.max(0, options.length - 1));
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const add = (code: string) => {
    onAdd(code);
    setQuery('');
    setHighlighted(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = languageKeyAction(event.key, { query, highlighted: active, options });
    if (!action) return;
    event.preventDefault();
    if (action.type === 'highlight') setHighlighted(action.index);
    else if (action.type === 'add') add(action.code);
    else if (action.type === 'removeLast') onRemoveLast();
    else onClose();
  };

  return (
    <div className="absolute top-[calc(100%+8px)] left-0 z-[5] box-border w-full max-w-[calc(100vw-32px)] min-w-[240px] rounded-[12px] border border-line bg-bg p-[6px] text-ink shadow-popover wide:w-[280px]">
      <input
        role="combobox"
        aria-label="Filter languages"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the popover opens to type in it
        autoFocus
        spellCheck={false}
        autoComplete="off"
        placeholder="Filter, or type a code"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlighted(0);
        }}
        onKeyDown={onKeyDown}
        className={cx(
          'box-border w-full rounded-[8px] bg-surface px-3 py-[9px] font-mono text-[13px] text-ink placeholder:text-muted',
          minHit,
          focusRingInset,
        )}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Languages"
        className="mt-[6px] max-h-[240px] overflow-y-auto"
      >
        {options.map((option, index) => (
          <LanguageOptionRow
            key={option.code}
            id={optionId(index)}
            option={option}
            highlighted={index === active}
            onHighlight={() => setHighlighted(index)}
            onPick={() => add(option.code)}
          />
        ))}
      </ul>
      {options.length === 0 && (
        <p className="px-3 py-[9px] font-sans text-[13px] text-muted">
          No match. Type a code such as en or pt-BR.
        </p>
      )}
    </div>
  );
}

/** A row of the list: the name (or the typed code), with the code as a muted hint. */
function LanguageOptionRow({
  id,
  option,
  highlighted,
  onHighlight,
  onPick,
}: {
  id: string;
  option: LanguageOption;
  highlighted: boolean;
  onHighlight: () => void;
  onPick: () => void;
}) {
  return (
    // Picked with the mouse here; the keyboard picks through the filter (aria-activedescendant).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
    <li
      id={id}
      role="option"
      aria-selected={highlighted}
      // Keep focus in the filter.
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onHighlight}
      onClick={onPick}
      className={cx(
        'flex cursor-pointer items-center justify-between gap-3 rounded-[8px] px-3 py-[9px] font-sans text-[13px] font-medium',
        highlighted && 'bg-surface',
      )}
    >
      <span>{option.custom ? `Add ${option.name || option.code}` : option.name}</span>
      <span className="font-mono text-[11px] font-normal text-muted">
        {option.custom ? `${option.code} · custom` : option.code}
      </span>
    </li>
  );
}
