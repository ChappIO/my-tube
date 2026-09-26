import { useId, type ReactNode } from 'react';
import { SectionLabel } from '../ui/typography';

export interface ActivitySectionProps {
  /** Section label: `Queue · 3`, `History`. */
  label: ReactNode;
  /**
   * Right-aligned next to the label on wide screens, on its own line under it when narrow
   * (the queue's Retry all failed).
   */
  action?: ReactNode;
  children: ReactNode;
}

/** An Activity section: the Space Mono section label over its content, gap 10. */
export function ActivitySection({ label, action, children }: ActivitySectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-[10px]">
      {action ? (
        <div className="grid justify-items-start gap-[10px] wide:flex wide:items-center wide:justify-between wide:gap-4">
          <SectionLabel id={id}>{label}</SectionLabel>
          {action}
        </div>
      ) : (
        <SectionLabel id={id}>{label}</SectionLabel>
      )}
      {children}
    </section>
  );
}

/** Rows of a list section (the queue), gap 10. */
export function ActivityList({ children }: { children: ReactNode }) {
  return <ul className="grid gap-[10px]">{children}</ul>;
}
