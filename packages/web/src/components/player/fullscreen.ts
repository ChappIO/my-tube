/*
 * Fullscreen for Now Playing (frontend skill "Player", "Fullscreen"): the standard Fullscreen API
 * with the WebKit-prefixed fallback (Safari), over duck-typed documents and elements so the
 * logic is testable without a DOM. The element made fullscreen is a wrapper (the video frame, the
 * music panel), never the `<video>`, so the app's own layers on it stay visible.
 */

/** What fullscreen needs of an element: the standard or the prefixed request. */
export interface FullscreenTarget {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => void;
}

/** What fullscreen needs of the document (`document`; a plain object in tests). */
export interface FullscreenDoc {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: unknown;
  webkitFullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/** The events that report a change (standard and prefixed). */
export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

/** The document, or null outside a browser (server rendering, tests). */
export function browserDocument(): FullscreenDoc | null {
  return typeof document === 'undefined' ? null : document;
}

/** Whether this browser can make an element fullscreen (iPhone Safari cannot: no pill there). */
export function fullscreenSupported(doc: FullscreenDoc | null): boolean {
  if (!doc) return false;
  return doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
}

/** The element that is fullscreen, or null. */
export function fullscreenElement(doc: FullscreenDoc | null): unknown {
  if (!doc) return null;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Makes `target` fullscreen. A refusal (no user gesture, a policy) is ignored. */
export async function enterFullscreen(target: FullscreenTarget): Promise<void> {
  try {
    if (target.requestFullscreen) await target.requestFullscreen();
    else target.webkitRequestFullscreen?.();
  } catch {
    // The browser said no; the page stays as it is.
  }
}

/** Leaves fullscreen when something is fullscreen. */
export async function exitFullscreen(doc: FullscreenDoc | null): Promise<void> {
  if (!doc || !fullscreenElement(doc)) return;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
  } catch {
    // Already out (the user pressed Esc at the same time).
  }
}

/** The pill and F: enters on `target`, or leaves when `target` is fullscreen. */
export function toggleFullscreen(doc: FullscreenDoc | null, target: FullscreenTarget | null): void {
  if (!doc || !target || !fullscreenSupported(doc)) return;
  if (fullscreenElement(doc) === target) void exitFullscreen(doc);
  else void enterFullscreen(target);
}

/**
 * Leaves fullscreen, then runs `then` (Pop out, leaving Now Playing): the page must not navigate
 * away from under a fullscreen element.
 */
export async function exitFullscreenFirst(
  doc: FullscreenDoc | null,
  then: () => void,
): Promise<void> {
  await exitFullscreen(doc);
  then();
}

/** The pill's label. */
export function fullscreenLabel(active: boolean): string {
  return active ? 'Exit fullscreen' : 'Fullscreen';
}

/**
 * Follows the browser: calls `onChange(active)` on every `fullscreenchange` (the pill, F, or the
 * browser's own Esc), `active` meaning `target` is the fullscreen element. Returns the cleanup.
 */
export function watchFullscreen(
  doc: FullscreenDoc,
  target: () => unknown,
  onChange: (active: boolean) => void,
): () => void {
  const listener = () => onChange(target() !== null && fullscreenElement(doc) === target());
  for (const type of FULLSCREEN_EVENTS) doc.addEventListener(type, listener);
  return () => {
    for (const type of FULLSCREEN_EVENTS) doc.removeEventListener(type, listener);
  };
}

let registered: (() => void) | null = null;

/**
 * The F key's target: the Now Playing surface that can go fullscreen registers its toggle while
 * mounted (null when it unmounts). Returns the cleanup, which only clears its own registration.
 */
export function registerFullscreenToggle(toggle: () => void): () => void {
  registered = toggle;
  return () => {
    if (registered === toggle) registered = null;
  };
}

/** F: toggles the registered surface. False when there is none (no Now Playing). */
export function toggleRegisteredFullscreen(): boolean {
  if (!registered) return false;
  registered();
  return true;
}
