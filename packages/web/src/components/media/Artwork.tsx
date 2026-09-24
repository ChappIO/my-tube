import { type ReactNode, useState } from 'react';
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
  /** Corner radius of a square: `tile` 12px (tiles), `thumb` 6px (32px row covers). */
  size?: 'tile' | 'thumb';
  /** Fill the positioned parent instead of sizing itself as a square. */
  fill?: boolean;
  /** Overlays drawn on the art, such as a duration badge. */
  children?: ReactNode;
  /** Layout placement only. */
  className?: string;
}

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
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = src !== undefined && src !== failedSrc;
  const radius =
    shape === 'circle' ? 'rounded-full' : size === 'thumb' ? 'rounded-chip' : 'rounded-tile';
  const box = fill ? 'absolute inset-0' : 'relative aspect-square w-full';

  return (
    <div
      className={`${box} overflow-hidden bg-surface ${radius} ${className}`}
      style={seed === undefined ? undefined : { background: placeholderFill(seed) }}
    >
      {showImage && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {children}
    </div>
  );
}
