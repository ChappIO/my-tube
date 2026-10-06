import { useEffect, useRef } from 'react';
import { BLURRED_COVER_SIZE, createBlurredCoverCache } from './cover-blur';
import { loadCoverPixels } from './palette';

/** The app's blurred covers, one per art URL. */
const covers = createBlurredCoverCache(loadCoverPixels);

/**
 * The Now Playing panel's background: the cover blurred, darkened and saturated once
 * (`cover-blur.ts`) into a small canvas that `object-fit: cover` scales over the panel. Nothing
 * is filtered per frame. A new cover replaces the picture when its pixels are ready; until then
 * the previous one stays. Without art, or when it fails, the panel's own black shows.
 */
export function BlurredCover({ artUrl }: { artUrl: string | null | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let current = true;
    covers
      .get(artUrl)
      .then((pixels) => {
        const context = current ? canvasRef.current?.getContext('2d') : null;
        if (!context) return;
        if (pixels) {
          // A copy: `ImageData` wants bytes over a plain `ArrayBuffer`.
          const bytes = new Uint8ClampedArray(pixels);
          context.putImageData(new ImageData(bytes, BLURRED_COVER_SIZE, BLURRED_COVER_SIZE), 0, 0);
        } else {
          context.clearRect(0, 0, BLURRED_COVER_SIZE, BLURRED_COVER_SIZE);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [artUrl]);
  return (
    <canvas
      ref={canvasRef}
      width={BLURRED_COVER_SIZE}
      height={BLURRED_COVER_SIZE}
      aria-hidden="true"
      className="absolute inset-0 size-full object-cover"
    />
  );
}
