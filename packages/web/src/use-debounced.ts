import { useEffect, useState } from 'react';

/**
 * `value` once it has stopped changing for `delayMs`. Compared by JSON, so a new object with
 * the same content (a rebuilt matcher) does not restart the wait.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
    // `key` stands for `value`'s content.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);
  return settled;
}
