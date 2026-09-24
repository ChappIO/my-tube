import { useEffect, useState } from 'react';

/**
 * The current time in ms, refreshed every `intervalMs` (default one minute), for relative
 * times such as `checked 12 min ago` that should move on while a screen stays open.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
