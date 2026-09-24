import type { ReactNode } from 'react';
import { Artwork } from '../media';
import { cx } from '../ui/cx';
import { Body } from '../ui/typography';

const avatarSizes = {
  44: 'size-11',
  56: 'size-14',
  88: 'size-22',
} as const;

export interface SourceAvatarProps {
  /** The channel or playlist avatar; the placeholder from `name` without one. */
  src: string | null;
  name: string;
  /** 44px (Add modal card), 56px (Channels row), 88px (channel page header). */
  size: keyof typeof avatarSizes;
  className?: string;
}

/** Round source avatar at one of the handoff's three sizes. Decorative: the name is next to it. */
export function SourceAvatar({ src, name, size, className }: SourceAvatarProps) {
  return (
    <div className={cx('shrink-0', avatarSizes[size], className)}>
      <Artwork shape="circle" src={src ?? undefined} seed={name} />
    </div>
  );
}

export interface RuleChipsProps {
  /** Chip texts, usually `describeRules(source.rules)`. Nothing renders without any. */
  chips: readonly string[];
  /** `row`: 3px 8px (Channels row). `page`: 4px 9px (channel page header). */
  size?: 'row' | 'page';
  className?: string;
}

/** Rule chips: Space Mono 11 on `surface` pills, gap 6, wrapping. */
export function RuleChips({ chips, size = 'row', className }: RuleChipsProps) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Rules" className={cx('flex flex-wrap gap-[6px]', className)}>
      {chips.map((chip) => (
        <li
          key={chip}
          className={cx(
            'rounded-pill bg-surface text-meta-sm',
            size === 'page' ? 'px-[9px] py-1' : 'px-2 py-[3px]',
          )}
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

/**
 * A plain status line (loading, empty, error): muted Archivo 14, announced politely. The
 * handoff leaves these undesigned and asks for plain text.
 */
export function StatusLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    // Takes no room while empty, so an idle line adds no gap to the layout around it.
    <div role="status" aria-live="polite" className={cx('empty:hidden', className)}>
      {children && <Body muted>{children}</Body>}
    </div>
  );
}
