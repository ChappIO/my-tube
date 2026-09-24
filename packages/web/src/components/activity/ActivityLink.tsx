import type { ReactNode } from 'react';
import { cx, focusRing } from '../ui/cx';

const linkClass = cx(
  'cursor-pointer rounded-badge font-mono text-[12px] text-ink underline underline-offset-2 hover:text-red disabled:cursor-default disabled:opacity-50',
  focusRing,
);

export type ActivityLinkProps =
  | { href: string; onClick?: never; disabled?: never; children: ReactNode; label?: string }
  | { href?: never; onClick: () => void; disabled?: boolean; children: ReactNode; label?: string };

/**
 * A small text action in the Activity screen ("Retry", "View log"): Space Mono 12, underlined.
 * With `href` it opens the target in a new tab (logs are plain text the browser shows);
 * otherwise it is a button. `label` is the accessible name when the text alone is ambiguous.
 */
export function ActivityLink({ href, onClick, disabled, children, label }: ActivityLinkProps) {
  if (href !== undefined) {
    return (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={linkClass}>
        {children}
      </a>
    );
  }
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
