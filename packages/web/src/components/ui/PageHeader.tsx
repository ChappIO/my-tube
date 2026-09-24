import type { ReactNode } from 'react';
import { cx } from './cx';
import { Body, PageTitle } from './typography';

export interface PageHeaderProps {
  title: ReactNode;
  /** Archivo 14 muted line under the title ("Across music and video, newest first."). */
  sub?: ReactNode;
  /** Right side: a StatCardGroup or TabPills. Wraps below the title when space runs out. */
  actions?: ReactNode;
  className?: string;
}

/** The sub line: 6px under the title, at least one line tall (`1lh` of the body type). */
const subLine = 'mt-[6px] min-h-[1lh]';

/**
 * Screen header: title and sub on the left, actions on the right, bottom-aligned.
 *
 * The sub line's height is always reserved, with or without `sub`, so every header is equally
 * tall and the tab pills sit at the same height on every section (Settings has no sub; Music and
 * Video do). Without the reservation the pills would jump when switching sections.
 */
export function PageHeader({ title, sub, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('flex flex-wrap items-end justify-between gap-5', className)}>
      <div className="min-w-0">
        <PageTitle>{title}</PageTitle>
        {sub ? (
          <Body muted as="div" className={subLine}>
            {sub}
          </Body>
        ) : (
          <div aria-hidden className={cx('text-body', subLine)} />
        )}
      </div>
      {actions && <div className="max-w-full min-w-0">{actions}</div>}
    </header>
  );
}
