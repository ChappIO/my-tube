import { type ReactNode, useId } from 'react';
import { SectionLabel } from '../ui/typography';

export interface DayGroupProps {
  /** `Today`, `Yesterday`, a weekday or a date. */
  label: string;
  /** The day's `TileGrid`. */
  children: ReactNode;
}

/** A Home day group: the Space Mono section label over its tiles, gap 14 (handoff Screen 1). */
export function DayGroup({ label, children }: DayGroupProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-[14px]">
      <SectionLabel id={id}>{label}</SectionLabel>
      {children}
    </section>
  );
}
