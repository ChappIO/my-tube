import type { ReactNode } from 'react';
import { cx } from './cx';

export interface StatCardProps {
  /** Space Mono 11 muted ("queue", "library"). */
  label: ReactNode;
  /** Archivo 700 16 ("3 downloading", "412 GB"). */
  value: ReactNode;
  className?: string;
}

/** Page header stat: label over value in a bordered, radius 10 card that never wraps. */
export function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div
      className={cx(
        'grid gap-[2px] rounded-nav border border-line px-[14px] py-[10px] whitespace-nowrap',
        className,
      )}
    >
      <div className="text-meta-sm text-muted">{label}</div>
      <div className="text-row-title">{value}</div>
    </div>
  );
}

/** Row of stat cards for the page header's actions slot (gap 10, wraps). */
export function StatCardGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-[10px]">{children}</div>;
}
