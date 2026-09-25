import type { ReactNode } from 'react';

/**
 * A numbered list of instructions (the cookies export help): Archivo 14, steps 14px apart,
 * the numbers in muted Space Mono. Children are `Step`s.
 */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="grid list-decimal gap-[14px] pl-6 text-body marker:font-mono marker:text-[13px] marker:text-muted">
      {children}
    </ol>
  );
}

export interface StepProps {
  /** A short lead-in in Archivo 600 ("Use a throwaway session."). */
  title: ReactNode;
  children: ReactNode;
}

/** One step: the title, then the instruction on the same line. */
export function Step({ title, children }: StepProps) {
  return (
    <li className="pl-1">
      <span className="font-semibold">{title}</span> {children}
    </li>
  );
}
