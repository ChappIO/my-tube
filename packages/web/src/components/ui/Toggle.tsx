import { type ReactNode, useId } from 'react';
import { cx, focusRing, hitArea } from './cx';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name when the switch has no visible label (ToggleRow provides one). */
  label?: string;
  id?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  /** `md` 44×26 (settings rows, default); `sm` 38×22 (Now Playing's subtitle style popover). */
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * 44×26 switch: red track when on, `surface2` when off, 20px white knob sliding from 3px to
 * 21px. `sm` is 38×22 with a 16px knob (3px → 19px). A native button with `role="switch"`, so
 * Space and Enter toggle it.
 */
export function Toggle({
  checked,
  onChange,
  label,
  size = 'md',
  className,
  ...props
}: ToggleProps) {
  const small = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'shrink-0 cursor-pointer rounded-pill disabled:cursor-default disabled:opacity-50',
        small ? 'h-[22px] w-[38px]' : 'h-[26px] w-11',
        hitArea,
        focusRing,
        checked ? 'bg-red' : 'bg-surface2',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cx(
          'absolute top-[3px] rounded-full bg-white motion-knob',
          small ? 'size-4' : 'size-5',
          checked ? (small ? 'left-[19px]' : 'left-[21px]') : 'left-[3px]',
        )}
      />
    </button>
  );
}

export interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Settings toggle row: label and description on the left, switch on the right, separated from
 * what is above by a top border. The whole row is clickable.
 */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: ToggleRowProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-4 border-t border-line pt-[14px]',
        className,
      )}
    >
      <label htmlFor={id} className={cx('min-w-0 flex-1', !disabled && 'cursor-pointer')}>
        <span className="block font-sans text-[14px] font-semibold">{label}</span>
        {description && (
          <span
            id={descriptionId}
            className="mt-[2px] block font-sans text-[13px] font-normal text-muted"
          >
            {description}
          </span>
        )}
      </label>
      <Toggle
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-describedby={description ? descriptionId : undefined}
      />
    </div>
  );
}
