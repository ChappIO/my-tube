/** Joins class names, skipping falsy values. A local stand-in for clsx. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Keyboard focus style shared by every control: 2px red outline, offset 2px. Only shown for keyboard focus. The values live once in `styles.css`
 * (the global `:focus-visible` rule and the `focus-ring` utilities); these constants name the
 * utilities so components can list them next to their other shared classes.
 */
export const focusRing = 'focus-ring';

/** The same ring drawn inside the element, for items in a clipping container (tab pills). */
export const focusRingInset = 'focus-ring-inset';

/** The ring in white, for controls on the red player bar. */
export const focusRingOnRed = 'focus-ring-on-red';

/**
 * The ring for keyboard focus only, also after a click followed by a shortcut key (the video
 * player's control strip and menus; `useInputModality` tracks the last input).
 */
export const focusRingVisible = 'focus-ring-visible';

/** `focusRingVisible` drawn inside the element (menu items in a clipping popover). */
export const focusRingVisibleInset = 'focus-ring-visible-inset';

/** No ring at all (the video frame and its scrubber, which show focus otherwise). */
export const focusRingNone = 'focus-ring-none';

/**
 * Rings the element when its overlay control (the descendant with `data-overlay`) has keyboard
 * focus. For tiles whose single interactive element is a full-size overlay button.
 */
export const focusRingOverlay = 'focus-ring-overlay';

/**
 * Minimum hit target: 44px tall on narrow screens, 36px on wide.
 * For controls that are visually smaller, use `hitArea` instead.
 */
export const minHit = 'min-h-11 wide:min-h-9';

/**
 * Extends the clickable area of a visually small control (32px circle, 26px switch) with an
 * invisible centered pseudo-element: 44×44 on narrow, 36×36 on wide. Adds `relative`.
 */
export const hitArea =
  "relative before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-1/2 before:content-[''] wide:before:size-9";

/**
 * The Settings value box (key/value grid): `surface` fill, Space Mono 13,
 * 9px 12px, radius 8. Full width on narrow screens; on wide ones at least 160px and as wide as
 * its content. Shared by `KeyValueText`, `Select` and `Input shape="value"`.
 */
export const valueBox =
  'box-border w-full rounded-[8px] bg-surface px-3 py-[9px] font-mono text-[13px] font-normal text-ink wide:w-max wide:min-w-40';
