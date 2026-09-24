import { useSyncExternalStore } from 'react';

// App-wide UI state that is neither server state nor in the URL: which global
// dialogs are open. A tiny external store, same pattern as theme.ts.

let addOpen = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to changes; returns the unsubscribe function. */
export function subscribeUiState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the Add to library modal is open. */
export function isAddOpen(): boolean {
  return addOpen;
}

/** Opens the Add to library modal. */
export function openAdd(): void {
  if (addOpen) return;
  addOpen = true;
  console.debug('[ui-state] Add to library requested; the modal arrives in Stage 3');
  notify();
}

/** Closes the Add to library modal. */
export function closeAdd(): void {
  if (!addOpen) return;
  addOpen = false;
  notify();
}

/**
 * The Add modal seam. Every Add button calls `openAdd`; the modal renders
 * while `open` is true and calls `closeAdd` to dismiss.
 */
export function useAddModal(): { open: boolean; openAdd: () => void; closeAdd: () => void } {
  const open = useSyncExternalStore(subscribeUiState, isAddOpen, () => false);
  return { open, openAdd, closeAdd };
}
