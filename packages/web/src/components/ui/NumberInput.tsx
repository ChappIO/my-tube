import { useState } from 'react';
import { cx } from './cx';
import { Input } from './Input';
import { useFieldId } from './KeyValueGrid';

export interface NumberInputProps {
  value: number;
  /** Called with each valid whole number in range as the user types or steps. */
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Defaults to the id of the surrounding `KeyValueRow`. */
  id?: string;
  /** Accessible name when there is no visible label. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Parses a whole number within bounds, or undefined. */
export function parseWholeNumber(text: string, min: number, max: number): number | undefined {
  if (!/^\s*-?\d+\s*$/.test(text)) return undefined;
  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
}

/**
 * Whole-number field in the Settings value box (`Input shape="value"`, `type="number"`). Every
 * valid value is reported immediately, so settings save without a Save button. While the text
 * is empty or out of range it is marked invalid and nothing is reported; leaving the field
 * restores the last valid value.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  id,
  label,
  disabled,
  className,
}: NumberInputProps) {
  const fieldId = useFieldId(id);
  // The text being typed; undefined shows `value`.
  const [draft, setDraft] = useState<string>();
  const text = draft ?? String(value);
  const invalid = parseWholeNumber(text, min, max) === undefined;
  return (
    <Input
      shape="value"
      type="number"
      inputMode="numeric"
      id={fieldId}
      aria-label={label}
      aria-invalid={invalid || undefined}
      min={min}
      max={max}
      step={1}
      value={text}
      disabled={disabled}
      className={cx(
        // The value box has no spin buttons by design; arrow keys still step.
        '[appearance:textfield] aria-invalid:text-red [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      onChange={(event) => {
        const next = event.target.value;
        const parsed = parseWholeNumber(next, min, max);
        setDraft(parsed === undefined ? next : undefined);
        if (parsed !== undefined && parsed !== value) onChange(parsed);
      }}
      onBlur={() => setDraft(undefined)}
    />
  );
}
