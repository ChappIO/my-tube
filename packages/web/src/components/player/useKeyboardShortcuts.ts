import { useEffect, useRef } from 'react';
import {
  SEEK_STEP_SECONDS,
  VOLUME_STEP,
  changeVolume,
  type PlayerState,
  playerState,
  seekBy,
  toggleMute,
  togglePlay,
} from '../../player-state';
import { hasOpenModal } from '../ui/Modal';
import { browserDocument, fullscreenElement, toggleRegisteredFullscreen } from './fullscreen';

export type Shortcut =
  | 'toggle'
  | 'forward'
  | 'back'
  | 'leave'
  | 'captions'
  | 'theater'
  | 'fullscreen'
  | 'mute'
  | 'volumeUp'
  | 'volumeDown';

/** The global keys: Space, ← → and J L (10 s), ↑ ↓ (volume), M (mute), F, Esc, C and T (video). */
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
    case 'c':
    case 'C':
      return 'captions';
    case 't':
    case 'T':
      return 'theater';
    case 'f':
    case 'F':
      return 'fullscreen';
    case 'm':
    case 'M':
      return 'mute';
    case 'ArrowUp':
      return 'volumeUp';
    case 'ArrowDown':
      return 'volumeDown';
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

/** What C and T do while a video plays. */
export interface VideoShortcuts {
  /** C: the next captions choice (Off → each track → Off). */
  onCaptions: () => void;
  /** T: Theater / Fit. */
  onTheater: () => void;
}

/** What a shortcut acts on besides the store's own actions. */
export interface ShortcutContext {
  state: Pick<PlayerState, 'player' | 'nowOpen' | 'fullscreen'>;
  /** A frame or panel is fullscreen (the store's flag, or the document's element). */
  inFullscreen: boolean;
  /** Esc: leave Now Playing. */
  leave: () => void;
  /** C and T, while a video plays. */
  video?: VideoShortcuts;
  /** F: toggles the registered Now Playing surface; false when there is none. */
  toggleFullscreen: () => boolean;
}

/**
 * Runs a shortcut; true when it acted (the key's default is then prevented). Esc leaves Now
 * Playing only while it is open and nothing is fullscreen (the browser's own Esc leaves
 * fullscreen first). F toggles fullscreen on Now Playing. The rest need a player; C and T a
 * video.
 */
export function runShortcut(shortcut: Shortcut, context: ShortcutContext): boolean {
  const { state } = context;
  if (shortcut === 'leave') {
    if (!state.nowOpen || context.inFullscreen) return false;
    context.leave();
    return true;
  }
  if (!state.player) return false;
  if (shortcut === 'fullscreen') return context.toggleFullscreen();
  if (shortcut === 'captions' || shortcut === 'theater') {
    const keys = context.video;
    if (state.player.kind !== 'video' || !keys) return false;
    if (shortcut === 'captions') keys.onCaptions();
    else keys.onTheater();
    return true;
  }
  if (shortcut === 'mute') toggleMute();
  else if (shortcut === 'volumeUp') changeVolume(VOLUME_STEP);
  else if (shortcut === 'volumeDown') changeVolume(-VOLUME_STEP);
  else if (shortcut === 'toggle') togglePlay();
  else seekBy(shortcut === 'forward' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
  return true;
}

/**
 * The player's keyboard (global while a player exists): Space plays or pauses, → / L forward and
 * ← / J back 10 s, ↑ ↓ change the volume by 5 %, M mutes or unmutes, F toggles fullscreen on Now
 * Playing, Esc leaves Now Playing (`onLeave`, only while it is open and not fullscreen), and
 * while a video plays C cycles the captions and T toggles theater (`video`). Ignored in text
 * fields and while a modal is open. Mount once (the shell's `PlayerLayer`).
 */
export function useKeyboardShortcuts(onLeave: () => void, video?: VideoShortcuts): void {
  const leave = useRef(onLeave);
  const videoKeys = useRef(video);
  useEffect(() => {
    leave.current = onLeave;
    videoKeys.current = video;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFor(event.key);
      const target = event.target instanceof Element ? event.target : null;
      if (shortcut === null || !shouldHandleKey({ ...pickKeys(event), target })) return;
      const state = playerState();
      const acted = runShortcut(shortcut, {
        state,
        inFullscreen: state.fullscreen || fullscreenElement(browserDocument()) !== null,
        leave: () => leave.current(),
        video: videoKeys.current,
        toggleFullscreen: toggleRegisteredFullscreen,
      });
      if (acted) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
