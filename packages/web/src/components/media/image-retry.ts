/**
 * Waits between attempts to load remote art: YouTube's image hosts answer bursts with 429, so a
 * failed image is tried again after 2s, then after 8s, before the placeholder stays.
 */
export const IMAGE_RETRY_DELAYS_MS = [2_000, 8_000] as const;

export interface ImageRetry {
  /** Report a failed load: schedules `onRetry` while retries remain, else calls `onGiveUp`. */
  error(): void;
  /** Cancels a pending retry. Call on unmount or when the source changes. */
  dispose(): void;
}

/**
 * The retry schedule for one image source, independent of React so it can be tested with fake
 * timers. After it gives up, a further `error()` gives up again at once: a caller that tries
 * one more time (the page became visible again) gets a single extra attempt.
 */
export function createImageRetry({
  onRetry,
  onGiveUp,
  delays = IMAGE_RETRY_DELAYS_MS,
}: {
  onRetry: () => void;
  onGiveUp: () => void;
  delays?: readonly number[];
}): ImageRetry {
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    error() {
      if (timer !== undefined) return;
      const delay = delays[failures];
      failures += 1;
      if (delay === undefined) {
        onGiveUp();
        return;
      }
      timer = setTimeout(() => {
        timer = undefined;
        onRetry();
      }, delay);
    },
    dispose() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
