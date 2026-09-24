import type { ReactNode } from 'react';

export interface TileGridProps {
  children: ReactNode;
  /** Layout placement only. */
  className?: string;
}

/**
 * Grid for media and music tiles: `repeat(auto-fill, minmax(180px, 1fr))`, gap 20px; narrow
 * `minmax(150px, 1fr)`, gap 12px.
 */
export function TileGrid({ children, className = '' }: TileGridProps) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 wide:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] wide:gap-5 ${className}`}
    >
      {children}
    </div>
  );
}
