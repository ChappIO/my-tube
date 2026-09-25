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
 * What Preview shows: a video. Music plays in the player instead (`player-state.ts`); video tiles
 * keep Preview until the video player replaces it.
 */
export type PreviewTarget = { kind: 'video'; id: number };

let preview: PreviewTarget | null = null;

function setPreview(next: PreviewTarget | null): void {
  if (preview?.id === next?.id) return;
  preview = next;
  notify();
}

/** What Preview shows, or null when it is closed. */
export function previewTarget(): PreviewTarget | null {
  return preview;
}

/** A stable key per target, so `AppShell` remounts Preview for each new one. */
export function previewKey(target: PreviewTarget): string {
  return `${target.kind}:${target.id}`;
}

/** Opens Preview for a video (a video tile click). */
export function openPreview(videoId: number): void {
  setPreview({ kind: 'video', id: videoId });
}

/** Closes Preview. */
export function closePreview(): void {
  setPreview(null);
}

/**
 * The Preview modal. Video tiles call `openPreview(videoId)`; `AppShell` renders `PreviewModal`
 * while `target` is set (keyed by `previewKey`, so each opening starts at the poster) and passes
 * `closePreview`.
 */
export function usePreview(): {
  target: PreviewTarget | null;
  openPreview: (videoId: number) => void;
  closePreview: () => void;
} {
  const target = useSyncExternalStore(subscribeUiState, previewTarget, () => null);
  return { target, openPreview, closePreview };
}

let jobLog: number | null = null;

/** The job whose log the log viewer shows, or null when it is closed. */
export function jobLogTarget(): number | null {
  return jobLog;
}

/** Opens the log viewer for a job (a queue row's or a history row's View log). */
export function openJobLog(jobId: number): void {
  if (jobLog === jobId) return;
  jobLog = jobId;
  notify();
}

/** Closes the log viewer. */
export function closeJobLog(): void {
  if (jobLog === null) return;
  jobLog = null;
  notify();
}

/**
 * The log viewer. View log links call `openJobLog(jobId)`; `AppShell` renders `LogViewerModal`
 * while `jobId` is set (keyed by it, so each opening starts fresh) and passes `closeJobLog`.
 */
export function useJobLogViewer(): {
  jobId: number | null;
  openJobLog: (jobId: number) => void;
  closeJobLog: () => void;
} {
  const jobId = useSyncExternalStore(subscribeUiState, jobLogTarget, () => null);
  return { jobId, openJobLog, closeJobLog };
}
