import type { ReactNode } from 'react';
import { cx, focusRing } from './cx';

export interface TextLinkProps {
  /** An external page; it opens in a new tab. */
  href: string;
  children: ReactNode;
}

/**
 * A link inside running text (the cookies help's store pages): the surrounding type, ink,
 * underlined, red on hover, like `TextAction` and the Activity links. Always external: opens in
 * a new tab with `rel="noreferrer"`.
 */
export function TextLink({ href, children }: TextLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx(
        'rounded-badge text-ink underline underline-offset-2 hover:text-red',
        focusRing,
      )}
    >
      {children}
    </a>
  );
}
