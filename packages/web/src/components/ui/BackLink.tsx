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

/** "← Video" back link above a detail page header: Archivo 600 13, muted, hover ink. */
export function BackLink({ link, children, className }: BackLinkProps) {
  return (
    <Link
      {...link}
      className={cx(
        'inline-flex items-center gap-1.5 self-start font-sans text-[13px] font-semibold text-muted hover:text-ink',
        focusRing,
        className,
      )}
    >
      <BackIcon size={14} />
      {children}
    </Link>
  );
}
