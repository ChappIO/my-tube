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

/**
 * What Preview shows: a video, a track, or the title of an album or playlist that has nothing
 * on disk yet (the player area says so).
 */
export type PreviewTarget =
  | { kind: 'video'; id: number }
  | { kind: 'track'; id: number }
  | { kind: 'empty'; title: string };

let preview: PreviewTarget | null = null;

function samePreview(a: PreviewTarget | null, b: PreviewTarget | null): boolean {
  return a === b || (a !== null && b !== null && previewKey(a) === previewKey(b));
}

function setPreview(next: PreviewTarget | null): void {
  if (samePreview(preview, next)) return;
  preview = next;
  notify();
}

/** What Preview shows, or null when it is closed. */
export function previewTarget(): PreviewTarget | null {
  return preview;
}

/** A stable key per target, so `AppShell` remounts Preview for each new one. */
export function previewKey(target: PreviewTarget): string {
  return target.kind === 'empty' ? `empty:${target.title}` : `${target.kind}:${target.id}`;
}

/** Opens Preview for a video (a video tile click). */
export function openPreview(videoId: number): void {
  setPreview({ kind: 'video', id: videoId });
}

/** Opens Preview for a track (a music tile click). */
export function openTrackPreview(trackId: number): void {
  setPreview({ kind: 'track', id: trackId });
}

/** Opens Preview for an album or playlist with nothing on disk: "Nothing on disk yet." */
export function openEmptyPreview(title: string): void {
  setPreview({ kind: 'empty', title });
}

/** Closes Preview. */
export function closePreview(): void {
  setPreview(null);
}

/**
 * The Preview modal. Tiles call `openPreview(videoId)`, `openTrackPreview(trackId)` or
 * `openEmptyPreview(title)`; `AppShell` renders `PreviewModal` while `target` is set (keyed by
 * `previewKey`, so each opening starts at the poster) and passes `closePreview`.
 */
export function usePreview(): {
  target: PreviewTarget | null;
  openPreview: (videoId: number) => void;
  openTrackPreview: (trackId: number) => void;
  openEmptyPreview: (title: string) => void;
  closePreview: () => void;
} {
  const target = useSyncExternalStore(subscribeUiState, previewTarget, () => null);
  return { target, openPreview, openTrackPreview, openEmptyPreview, closePreview };
}
