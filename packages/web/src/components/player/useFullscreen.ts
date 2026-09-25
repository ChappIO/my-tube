import { type RefObject, useCallback, useEffect, useState } from 'react';
import { setFullscreen } from '../../player-state';
import {
  browserDocument,
  exitFullscreen,
  fullscreenElement,
  fullscreenSupported,
  registerFullscreenToggle,
  toggleFullscreen,
  watchFullscreen,
} from './fullscreen';

export interface Fullscreen {
  /** The browser can make an element fullscreen (else the pill is hidden). */
  supported: boolean;
  /** `ref`'s element is fullscreen now (it follows `fullscreenchange`, so the browser's Esc too). */
  active: boolean;
  /** The pill: enter, or leave when it is fullscreen. */
  toggle: () => void;
}

/**
 * Fullscreen on a Now Playing wrapper (the video frame, the music panel). It follows the browser
 * (`fullscreenchange`) into `active` and the store's `fullscreen`, registers itself as F's
 * target while mounted, moves focus off a control outside the wrapper on entering (so Space
 * reaches the global play and pause instead of pressing the pill) and leaves fullscreen when it
 * unmounts.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): Fullscreen {
  // A client-only app: the document is there on the first render (tests render without one).
  const [supported] = useState(() => fullscreenSupported(browserDocument()));
  const [active, setActive] = useState(false);

  const toggle = useCallback(() => toggleFullscreen(browserDocument(), ref.current), [ref]);

  useEffect(() => {
    const doc = browserDocument();
    if (!doc) return undefined;
    // The wrapper is mounted with the hook's owner and stays: read once for the cleanup.
    const element = ref.current;
    const stopWatching = watchFullscreen(
      doc,
      () => ref.current,
      (now) => {
        setActive(now);
        setFullscreen(now);
        const focused = document.activeElement;
        if (now && focused instanceof HTMLElement && !ref.current?.contains(focused)) {
          focused.blur();
        }
      },
    );
    const unregister = registerFullscreenToggle(toggle);
    return () => {
      stopWatching();
      unregister();
      if (element && fullscreenElement(doc) === element) void exitFullscreen(doc);
      setFullscreen(false);
    };
  }, [ref, toggle]);

  return { supported, active, toggle };
}
