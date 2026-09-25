import { useEffect, useRef } from 'react';
import { SEEK_STEP_SECONDS, playerState, seekBy, togglePlay } from '../../player-state';
import { hasOpenModal } from '../ui/Modal';

export type Shortcut = 'toggle' | 'forward' | 'back' | 'leave';

/** The global keys: Space, ← → and J L (10 s), Esc (leave Now Playing). */
export function shortcutFor(key: string): Shortcut | null {
  switch (key) {
    case ' ':
      return 'toggle';
    case 'ArrowRight':
    case 'l':
    case 'L':
      return 'forward';
    case 'ArrowLeft':
    case 'j':
    case 'J':
      return 'back';
    case 'Escape':
      return 'leave';
    default:
      return null;
  }
}

/** The parts of an event target the guard reads (an element, duck-typed for tests). */
interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

/** Where typing happens: every key belongs to the field. */
function isTextEntry(target: KeyTarget): boolean {
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Controls Space activates itself (clicking it), so the shortcut must not act as well. */
const SPACE_CONTROLS =
  'button, a[href], summary, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"]';

/**
 * Whether a keydown is the player's: not with a modifier, not already handled, not while a modal
 * is open (its own Escape and focus trap win), not in a text field, select or contenteditable,
 * and Space not on a control that Space presses.
 */
export function shouldHandleKey(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'defaultPrevented'> & {
    target: KeyTarget | null;
  },
  modalOpen = hasOpenModal(),
): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (modalOpen) return false;
  const { target } = event;
  if (target) {
    if (isTextEntry(target)) return false;
    if (event.key === ' ' && target.closest?.(SPACE_CONTROLS)) return false;
  }
  return true;
}

function pickKeys(event: KeyboardEvent) {
  const { key, altKey, ctrlKey, metaKey, defaultPrevented } = event;
  return { key, altKey, ctrlKey, metaKey, defaultPrevented };
}

/**
 * The player's keyboard (global while a player exists): Space plays or pauses, → / L forward and
 * ← / J back 10 s, Esc leaves Now Playing (`onLeave`, only while it is open). Ignored in text fields and
 * while a modal is open. Mount once (the shell's `PlayerLayer`).
 */
export function useKeyboardShortcuts(onLeave: () => void): void {
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFor(event.key);
      const target = event.target instanceof Element ? event.target : null;
      if (shortcut === null || !shouldHandleKey({ ...pickKeys(event), target })) return;
      const state = playerState();
      if (shortcut === 'leave') {
        if (!state.nowOpen) return;
        event.preventDefault();
        leave.current();
        return;
      }
      if (!state.player) return;
      event.preventDefault();
      if (shortcut === 'toggle') togglePlay();
      else seekBy(shortcut === 'forward' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
