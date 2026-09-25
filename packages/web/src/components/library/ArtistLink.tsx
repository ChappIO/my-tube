import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cx, focusRing } from '../ui/cx';
import { artistPageLink } from './artist-page';

/**
 * An artist's name as a link to the artist page (the album page's header and Artist card, the
 * Tracks table's artist cell): inherits the type around it, hover red + underline, like channel
 * names. A router link, so it opens in a new tab too.
 */
export function ArtistLink({
  id,
  children,
  className,
}: {
  id: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      {...artistPageLink(id)}
      className={cx('rounded-badge hover:text-red hover:underline', focusRing, className)}
    >
      {children}
    </Link>
  );
}
