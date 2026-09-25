import type { MouseEvent } from 'react';
import { BellIcon } from '../icons';
import { cx, focusRing, hitArea, minHit } from '../ui/cx';

export interface BellToggleProps {
  /** Current subscription state. */
  subscribed: boolean;
  /** Called with the new state on click; toggles immediately, no confirmation. */
  onToggle: (subscribed: boolean) => void;
  /** `circle`: 36px icon button (lists). `pill`: bell and label (channel page). */
  form?: 'circle' | 'pill';
  /**
   * Accessible name, for example `Subscribe to Radiohead`. The circle has no visible text and
   * defaults to `Subscribe`; the pill defaults to its visible label.
   */
  label?: string;
  /** The pill stretches to its container with the label centred (the album page's artist card). */
  fullWidth?: boolean;
  /** Layout placement only. */
  className?: string;
}

/**
 * Subscription bell. Subscribed: red fill, white bell, red border. Not subscribed:
 * transparent, ink bell, `line` border. The pill reads "Subscribed" / "Subscribe".
 */
export function BellToggle({
  subscribed,
  onToggle,
  form = 'circle',
  label,
  fullWidth = false,
  className,
}: BellToggleProps) {
  const state = subscribed ? 'border-red bg-red text-white' : 'border-line bg-transparent text-ink';
  const text = subscribed ? 'Subscribed' : 'Subscribe';

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Bells sit inside clickable rows and tiles; the toggle is not a click on those.
    event.stopPropagation();
    onToggle(!subscribed);
  }

  if (form === 'pill') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={subscribed}
        aria-label={label}
        onClick={handleClick}
        className={cx(
          'inline-flex cursor-pointer items-center gap-2 rounded-pill border py-[9px] pr-4 pl-3 font-sans text-[13px] font-semibold whitespace-nowrap',
          minHit,
          focusRing,
          state,
          fullWidth && 'w-full justify-center',
          className,
        )}
      >
        <BellIcon size={14} />
        {text}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={subscribed}
      aria-label={label ?? 'Subscribe'}
      title={text}
      onClick={handleClick}
      className={cx(
        'grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border',
        hitArea,
        focusRing,
        state,
        className,
      )}
    >
      <BellIcon size={14} />
    </button>
  );
}
