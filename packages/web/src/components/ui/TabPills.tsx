import { Link, type LinkOptions } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cx, focusRingInset, minHit } from './cx';

export type TabPillSize = 'md' | 'sm';

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
  size?: TabPillSize;
  className?: string;
}

const itemSizes: Record<TabPillSize, string> = {
  md: 'px-4 py-2 text-[14px]',
  sm: 'px-[14px] py-[7px] text-[13px]',
};

// Shared by the button and link variants so the two can never drift apart.
function trackClass(size: TabPillSize, className?: string): string {
  return cx(
    'inline-flex max-w-full overflow-x-auto rounded-pill bg-surface p-1 [scrollbar-width:none]',
    size === 'sm' ? 'gap-1' : 'gap-[6px]',
    className,
  );
}

function itemClass(size: TabPillSize, active: boolean): string {
  return cx(
    'inline-flex shrink-0 cursor-pointer items-center rounded-pill font-sans font-semibold whitespace-nowrap',
    // Inset ring: the track clips anything outside it.
    focusRingInset,
    minHit,
    itemSizes[size],
    active ? 'bg-bg text-ink' : 'bg-transparent text-muted',
  );
}

/**
 * Tab pill track: `surface` pill with the active item filled `bg`. A group of toggle buttons
 * (`aria-pressed`) for in-page state; `TabPillLinks` is the routed variant. Scrolls
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
    <div role="group" aria-label={label} className={trackClass(size, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={itemClass(size, active)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPillLinkItem<T extends string> extends TabPillItem<T> {
  /** Where the pill goes, built with `linkOptions({ to, params })`. */
  link: LinkOptions;
}

export interface TabPillLinksProps<T extends string> {
  items: readonly TabPillLinkItem<T>[];
  /** The current tab, usually from the route params. */
  value: T;
  /** Accessible name for the nav ("Music view"). */
  label: string;
  size?: TabPillSize;
  className?: string;
}

/**
 * Routed tab pill track: the same look as `TabPills`, but each pill is a `Link` and the
 * active one carries `aria-current="page"`. Use it for tabs that live in the URL.
 */
export function TabPillLinks<T extends string>({
  items,
  value,
  label,
  size = 'md',
  className,
}: TabPillLinksProps<T>) {
  return (
    <nav aria-label={label} className={trackClass(size, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <Link
            key={item.id}
            {...item.link}
            aria-current={active ? 'page' : undefined}
            className={itemClass(size, active)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
