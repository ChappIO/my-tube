import { useId, type ReactNode } from 'react';
import { SectionLabel } from '../ui/typography';

export interface ActivitySectionProps {
  /** Section label: `Queue · 3`, `History`. */
  label: ReactNode;
  children: ReactNode;
}

/** An Activity section: the Space Mono section label over its content, gap 10 (handoff). */
export function ActivitySection({ label, children }: ActivitySectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-[10px]">
      <SectionLabel id={id}>{label}</SectionLabel>
      {children}
    </section>
  );
}

/** Rows of a list section (the queue), gap 10. */
export function ActivityList({ children }: { children: ReactNode }) {
  return <ul className="grid gap-[10px]">{children}</ul>;
}
