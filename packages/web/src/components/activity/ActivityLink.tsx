import type { ReactNode } from 'react';
import { cx, focusRing } from '../ui/cx';

const linkClass = cx(
  'cursor-pointer rounded-badge font-mono text-[12px] text-ink underline underline-offset-2 hover:text-red disabled:cursor-default disabled:opacity-50',
  focusRing,
);

export interface ActivityLinkProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  /** The accessible name when the text alone is ambiguous ("View log of <title>"). */
  label?: string;
}

/**
 * A small text action in the Activity screen ("Retry", "View log"): a button in Space Mono 12,
 * underlined.
 */
export function ActivityLink({ onClick, disabled, children, label }: ActivityLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={linkClass}
    >
      {children}
    </button>
  );
}
