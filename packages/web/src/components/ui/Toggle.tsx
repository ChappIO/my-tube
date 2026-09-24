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
  className?: string;
}

/**
 * 44×26 switch: red track when on, `surface2` when off, 20px white knob sliding from 3px to
 * 21px. A native button with `role="switch"`, so Space and Enter toggle it.
 */
export function Toggle({ checked, onChange, label, className, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'h-[26px] w-11 shrink-0 cursor-pointer rounded-pill disabled:cursor-default disabled:opacity-50',
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
          'absolute top-[3px] size-5 rounded-full bg-white',
          checked ? 'left-[21px]' : 'left-[3px]',
        )}
        // Handoff Motion: "Toggle knob: left .15s".
        style={{ transition: 'left .15s' }}
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
