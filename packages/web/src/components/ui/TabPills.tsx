import type { ReactNode } from 'react';
import { cx, focusRingInset, minHit } from './cx';

export interface TabPillItem<T extends string> {
  id: T;
  label: ReactNode;
}

export interface TabPillsProps<T extends string> {
  items: readonly TabPillItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the group ("Music view", "Save to"). */
  label: string;
  /** `md`: 8px 16px, Archivo 14 (default). `sm`: 7px 14px, Archivo 13 (filters). */
  size?: 'md' | 'sm';
  className?: string;
}

const itemSizes = {
  md: 'px-4 py-2 text-[14px]',
  sm: 'px-[14px] py-[7px] text-[13px]',
} as const;

/**
 * Tab pill track: `surface` pill with the active item filled `bg`. A group of toggle buttons
 * (`aria-pressed`); a routed variant can wrap the same styles in links later. Scrolls
 * sideways inside itself rather than pushing the page wider on narrow screens.
 */
export function TabPills<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: TabPillsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(
        'inline-flex max-w-full overflow-x-auto rounded-pill bg-surface p-1 [scrollbar-width:none]',
        size === 'sm' ? 'gap-1' : 'gap-[6px]',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cx(
              'shrink-0 cursor-pointer rounded-pill font-sans font-semibold whitespace-nowrap',
              // Inset ring: the track clips anything outside it.
              focusRingInset,
              minHit,
              itemSizes[size],
              active ? 'bg-bg text-ink' : 'bg-transparent text-muted',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
