/**
 * Focus helpers for dialogs: a Tab/Shift+Tab trap and a stack of open layers so nested
 * dialogs react to Escape and Tab only when they are on top. No dependencies.
 */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/** Elements inside `container` that Tab can reach, in DOM order. */
export function tabbableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

/**
 * Where Tab should move focus to stay inside a dialog, or `null` to let the browser move it.
 * Wraps from the last tabbable to the first (and back with Shift), and pulls focus back in
 * when it sits on the dialog itself or has escaped.
 */
export function wrapTarget<T>(tabbables: readonly T[], active: T | null, shift: boolean): T | null {
  const first = tabbables[0];
  const last = tabbables[tabbables.length - 1];
  if (first === undefined || last === undefined) return null;
  const index = active === null ? -1 : tabbables.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift && index === 0) return last;
  if (!shift && index === tabbables.length - 1) return first;
  return null;
}

/**
 * Keeps Tab and Shift+Tab inside `container`. Call from a keydown handler; does nothing for
 * other keys. When nothing inside is tabbable, focus stays on the container.
 */
export function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const tabbables = tabbableWithin(container);
  if (tabbables.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = wrapTarget(tabbables, active, event.shiftKey);
  if (target) {
    event.preventDefault();
    target.focus();
  }
}

/**
 * A stack of open layers (modals). Each open layer pushes a token and removes it on close;
 * only the top token handles Escape and Tab, so a nested dialog closes before its parent.
 */
export interface LayerStack {
  push(): symbol;
  remove(token: symbol): void;
  isTop(token: symbol): boolean;
  size(): number;
}

export function createLayerStack(): LayerStack {
  const layers: symbol[] = [];
  return {
    push() {
      const token = Symbol('layer');
      layers.push(token);
      return token;
    },
    remove(token) {
      const index = layers.indexOf(token);
      if (index !== -1) layers.splice(index, 1);
    },
    isTop(token) {
      return layers[layers.length - 1] === token;
    },
    size() {
      return layers.length;
    },
  };
}
