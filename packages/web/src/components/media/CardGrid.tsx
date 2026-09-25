import type { ReactNode } from 'react';

export interface CardGridProps {
  children: ReactNode;
  /** Layout placement only. */
  className?: string;
}

/**
 * Grid for the wide video cards (`MediaCard`): `repeat(auto-fill, minmax(300px, 1fr))`, gap
 * 20px; narrow `minmax(240px, 1fr)`, gap 16px, so a phone gets one full-width card.
 */
export function CardGrid({ children, className = '' }: CardGridProps) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 wide:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] wide:gap-5 ${className}`}
    >
      {children}
    </div>
  );
}
