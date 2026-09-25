import { useCallback } from 'react';
import { type VideoSurfaceKind, registerVideoHost } from './video-surface';

/**
 * Where the video shows: an empty box filling its positioned parent that `VideoEngine`'s one
 * `<video>` moves into while it is the most important surface mounted (Now Playing's frame over
 * the card). It must stay without React children: the element inside is not React's.
 */
export function VideoSurface({ kind }: { kind: VideoSurfaceKind }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return undefined;
      return registerVideoHost(element, kind);
    },
    [kind],
  );
  return <div ref={ref} className="absolute inset-0" />;
}
