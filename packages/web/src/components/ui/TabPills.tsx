import { Link, type LinkOptions } from '@tanstack/react-router';
import { type ComponentType, type ReactNode, type RefObject, useEffect, useRef } from 'react';
import type { IconProps } from '../icons';
import { cx, focusRingInset, minHit } from './cx';

export type TabPillSize = 'md' | 'sm';

export interface TabPillItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional icon from `components/icons` (for example `TAB_ICONS[id]`), 16px before the label. */
  icon?: ComponentType<IconProps>;
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
    'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-pill font-sans font-semibold whitespace-nowrap',
    // Inset ring: the track clips anything outside it.
    focusRingInset,
    minHit,
    itemSizes[size],
    active ? 'bg-bg text-ink' : 'bg-transparent text-muted',
  );
}

/** Item content shared by both variants: optional 16px icon, 8px gap, label. */
function TabPillContent({ item }: { item: TabPillItem<string> }) {
  const Icon = item.icon;
  return (
    <>
      {Icon && <Icon size={16} />}
      {item.label}
    </>
  );
}

/**
 * When the track scrolls sideways (narrow screens), keeps the active pill visible: on first
 * render `/music/tracks` would otherwise show its active pill cut off at the edge.
 */
function useActivePillInView<E extends HTMLElement>(value: string): RefObject<E | null> {
  const ref = useRef<E>(null);
  useEffect(() => {
    // Next task: on navigation the router's scroll restoration copies the track's old
    // scrollLeft onto the new location after this effect, so adjusting now would be undone.
    // Not requestAnimationFrame, which never fires in a hidden tab.
    const timer = setTimeout(() => {
      const track = ref.current;
      const item = track?.querySelector<HTMLElement>(`[data-pill="${CSS.escape(value)}"]`);
      if (!track || !item) return;
      const t = track.getBoundingClientRect();
      const i = item.getBoundingClientRect();
      if (i.left < t.left) track.scrollLeft -= t.left - i.left + 4;
      else if (i.right > t.right) track.scrollLeft += i.right - t.right + 4;
    }, 0);
    return () => clearTimeout(timer);
  }, [value]);
  return ref;
}

/**
 * Tab pill track: `surface` pill with the active item filled `bg`. A group of toggle buttons
 * (`aria-pressed`) for in-page state; `TabPillLinks` is the routed variant. Scrolls
 * sideways inside itself rather than pushing the page wider on narrow screens, keeping the
 * active pill in view.
 */
export function TabPills<T extends string>({
  items,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: TabPillsProps<T>) {
  const ref = useActivePillInView<HTMLDivElement>(value);
  return (
    <div ref={ref} role="group" aria-label={label} className={trackClass(size, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            data-pill={item.id}
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={itemClass(size, active)}
          >
            <TabPillContent item={item} />
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
  const ref = useActivePillInView<HTMLElement>(value);
  return (
    <nav ref={ref} aria-label={label} className={trackClass(size, className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <Link
            key={item.id}
            {...item.link}
            data-pill={item.id}
            aria-current={active ? 'page' : undefined}
            className={itemClass(size, active)}
          >
            <TabPillContent item={item} />
          </Link>
        );
      })}
    </nav>
  );
}
