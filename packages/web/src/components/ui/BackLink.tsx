import { Link, type LinkOptions } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BackIcon } from '../icons';
import { cx, focusRing } from './cx';

export interface BackLinkProps {
  /** Where to go, built with `linkOptions({ to, params })`. */
  link: LinkOptions;
  /** The destination's name ("Video"). */
  children: ReactNode;
  className?: string;
}

const backClass =
  'inline-flex cursor-pointer items-center gap-1.5 self-start font-sans text-[13px] font-semibold text-muted hover:text-ink';

/** "← Video" back link above a detail page header: Archivo 600 13, muted, hover ink. */
export function BackLink({ link, children, className }: BackLinkProps) {
  return (
    <Link {...link} className={cx(backClass, focusRing, className)}>
      <BackIcon size={14} />
      {children}
    </Link>
  );
}

/**
 * The back link as a button, for a destination that is the previous page rather than a fixed
 * route (Now Playing's "← Back to library"). Same look as `BackLink`.
 */
export function BackButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cx(backClass, focusRing, className)}>
      <BackIcon size={14} />
      {children}
    </button>
  );
}
