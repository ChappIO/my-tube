/** Joins class names, skipping falsy values. A local stand-in for clsx. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Keyboard focus style shared by every control: 2px red outline, offset 2px (the handoff has no
 * designed focus ring). Only shown for keyboard focus.
 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-red';

/** The same ring drawn inside the element, for items in a clipping container (tab pills). */
export const focusRingInset =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-red';

/**
 * Minimum hit target: 44px tall on narrow screens, 36px on wide (handoff "Buttons").
 * For controls that are visually smaller, use `hitArea` instead.
 */
export const minHit = 'min-h-11 wide:min-h-9';

/**
 * Extends the clickable area of a visually small control (32px circle, 26px switch) with an
 * invisible centered pseudo-element: 44×44 on narrow, 36×36 on wide. Adds `relative`.
 */
export const hitArea =
  "relative before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2 before:content-[''] wide:before:size-9";
