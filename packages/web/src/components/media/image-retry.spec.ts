import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageRetry } from './image-retry';

function setup() {
  const onRetry = vi.fn<() => void>();
  const onGiveUp = vi.fn<() => void>();
  return { onRetry, onGiveUp, retry: createImageRetry({ onRetry, onGiveUp }) };
}

describe('createImageRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries after 2s, then after 8s, then gives up', () => {
    const { onRetry, onGiveUp, retry } = setup();
    retry.error();
    vi.advanceTimersByTime(1_999);
    expect(onRetry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(1);

    retry.error();
    vi.advanceTimersByTime(7_999);
    expect(onRetry).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onGiveUp).not.toHaveBeenCalled();

    retry.error();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('gives up at once on a further error after giving up', () => {
    const { onGiveUp, retry } = setup();
    for (let i = 0; i < 3; i += 1) {
      retry.error();
      vi.runAllTimers();
    }
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    retry.error();
    expect(onGiveUp).toHaveBeenCalledTimes(2);
  });

  it('ignores errors while a retry is pending', () => {
    const { onRetry, retry } = setup();
    retry.error();
    retry.error();
    vi.advanceTimersByTime(2_000);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // The second error did not use up the 8s retry.
    retry.error();
    vi.advanceTimersByTime(8_000);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending retry on dispose', () => {
    const { onRetry, retry } = setup();
    retry.error();
    retry.dispose();
    vi.runAllTimers();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
