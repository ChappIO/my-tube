import { useSyncExternalStore } from 'react';

// App-wide UI state that is neither server state nor in the URL: which global
// dialogs are open. A tiny external store, same pattern as theme.ts.

let addOpen = false;
let previewId: number | null = null;
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
  notify();
}

/** Closes the Add to library modal. */
export function closeAdd(): void {
  if (!addOpen) return;
  addOpen = false;
  notify();
}

/**
 * The Add modal. Every Add button calls `openAdd`; `AppShell` renders `AddSourceModal` while
 * `open` is true, and the modal calls `closeAdd` to dismiss.
 */
export function useAddModal(): { open: boolean; openAdd: () => void; closeAdd: () => void } {
  const open = useSyncExternalStore(subscribeUiState, isAddOpen, () => false);
  return { open, openAdd, closeAdd };
}

/** The video Preview shows, or null when it is closed. */
export function previewVideoId(): number | null {
  return previewId;
}

/** Opens Preview for a video (a tile click). */
export function openPreview(videoId: number): void {
  if (previewId === videoId) return;
  previewId = videoId;
  notify();
}

/** Closes Preview. */
export function closePreview(): void {
  if (previewId === null) return;
  previewId = null;
  notify();
}

/**
 * The Preview modal. Tiles call `openPreview(id)`; `AppShell` renders `PreviewModal` while
 * `videoId` is set (so each opening starts at the poster) and passes `closePreview`.
 */
export function usePreview(): {
  videoId: number | null;
  openPreview: (videoId: number) => void;
  closePreview: () => void;
} {
  const videoId = useSyncExternalStore(subscribeUiState, previewVideoId, () => null);
  return { videoId, openPreview, closePreview };
}
