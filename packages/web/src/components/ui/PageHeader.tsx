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

/** Screen header: title and sub on the left, actions on the right, bottom-aligned. */
export function PageHeader({ title, sub, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('flex flex-wrap items-end justify-between gap-5', className)}>
      <div className="min-w-0">
        <PageTitle>{title}</PageTitle>
        {sub && (
          <Body muted as="div" className="mt-[6px]">
            {sub}
          </Body>
        )}
      </div>
      {actions && <div className="max-w-full min-w-0">{actions}</div>}
    </header>
  );
}
