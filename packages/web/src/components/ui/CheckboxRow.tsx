import type { ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { cx, minHit } from './cx';

export interface CheckboxRowProps {
  label: ReactNode;
  /** Right-aligned Space Mono hint ("under 60 s"). */
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Rule row from the Add modal: 20px box (red with a white check when on, `surface2` border when
 * off), label, hint. Checked rows get a `surface` background. A native checkbox underneath keeps
 * it keyboard and screen reader friendly.
 */
export function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: CheckboxRowProps) {
  return (
    <label
      className={cx(
        'flex items-center gap-3 rounded-nav px-3 py-[11px] has-[:disabled]:opacity-50',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-red',
        !disabled && 'cursor-pointer',
        checked && 'bg-surface',
        minHit,
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={cx(
          'grid size-5 shrink-0 place-items-center rounded-chip border-2',
          checked ? 'border-red bg-red text-white' : 'border-surface2',
        )}
      >
        {checked && <CheckIcon size={12} strokeWidth={3.5} />}
      </span>
      {/* Label and hint share a wrapping line: on a narrow screen a long hint moves under the
          label instead of squeezing it into a column. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-sans text-[14px] font-medium">{label}</span>
        {hint && <span className="text-meta text-muted">{hint}</span>}
      </span>
    </label>
  );
}
