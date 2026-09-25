import { type ReactNode, useEffect, useRef, useState } from 'react';
import { type ImageRetry, createImageRetry } from './image-retry';
import { placeholderFill } from './placeholder';

export interface ArtworkProps {
  /** Cover or thumbnail URL. Without it (or when it fails to load) the placeholder shows. */
  src?: string;
  /** Alt text for the image. Leave empty for decorative art next to a visible title. */
  alt?: string;
  /** Seed for the placeholder gradient. Without a seed the box is plain `surface`. */
  seed?: string;
  /** `square` for covers and thumbnails, `circle` for artist and channel avatars. */
  shape?: 'square' | 'circle';
  /**
   * Corner radius of a square: `tile` 12px (tiles), `thumb` 6px (32px row covers), `list` 8px
   * (the 44px covers of the narrow Tracks list), `flush` none (the parent clips it to its own
   * radius: the player's bar, card and Now Playing art).
   */
  size?: 'tile' | 'thumb' | 'list' | 'flush';
  /** Fill the positioned parent instead of sizing itself as a square. */
  fill?: boolean;
  /** Overlays drawn on the art, such as a duration badge. */
  children?: ReactNode;
  /** Layout placement only. */
  className?: string;
}

const SQUARE_RADII = {
  tile: 'rounded-tile',
  thumb: 'rounded-chip',
  list: 'rounded-[8px]',
  flush: '',
} as const;

/** Square or round artwork with a `surface` background while loading and a placeholder fallback. */
export function Artwork({
  src,
  alt = '',
  seed,
  shape = 'square',
  size = 'tile',
  fill = false,
  children,
  className = '',
}: ArtworkProps) {
  const status = useImageStatus(src);
  const showImage = src !== undefined && status.state === 'loading';
  const radius = shape === 'circle' ? 'rounded-full' : SQUARE_RADII[size];
  const box = fill ? 'absolute inset-0' : 'relative aspect-square w-full';

  return (
    <div
      className={`${box} overflow-hidden bg-surface ${radius} ${className}`}
      style={seed === undefined ? undefined : { background: placeholderFill(seed) }}
    >
      {showImage && (
        <img
          // A new key re-mounts the element, so a retry requests the same URL again.
          key={status.attempt}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={status.onError}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {children}
    </div>
  );
}

type ImageState = 'loading' | 'waiting' | 'failed';

/**
 * Load state of a remote image. A failed load is retried with the same URL after 2s and 8s
 * (`IMAGE_RETRY_DELAYS_MS`; Google's image hosts rate-limit bursts with 429), and only then the
 * placeholder stays. While waiting the placeholder shows instead of a broken image. A new `src`
 * starts over, and a page that becomes visible again tries a failed image once more.
 */
function useImageStatus(src: string | undefined): {
  state: ImageState;
  attempt: number;
  onError: () => void;
} {
  const [tracked, setTracked] = useState(src);
  const [state, setState] = useState<ImageState>('loading');
  const [attempt, setAttempt] = useState(0);
  const retry = useRef<ImageRetry>(null);

  // A different image: forget the previous one's failures (state adjusted during render).
  if (tracked !== src) {
    setTracked(src);
    setState('loading');
    setAttempt(0);
  }

  // One retry schedule per image, so a new `src` gets its retries back.
  useEffect(() => {
    if (src === undefined) return undefined;
    const schedule = createImageRetry({
      onRetry: () => {
        setState('loading');
        setAttempt((n) => n + 1);
      },
      onGiveUp: () => setState('failed'),
    });
    retry.current = schedule;
    return () => schedule.dispose();
  }, [src]);

  useEffect(() => {
    if (state !== 'failed') return undefined;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setState('loading');
      setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state]);

  return {
    state,
    attempt,
    onError: () => {
      setState((current) => (current === 'loading' ? 'waiting' : current));
      retry.current?.error();
    },
  };
}
