import { Artwork } from './Artwork';
import { STACK_SCENE_STYLE, stackCovers, stackLayerStyle, stackOverlayOpacity } from './stack';

export interface PlaylistStackProps {
  /** Cover URLs of tracks in the playlist, front first. See `stackCovers` for fewer than four. */
  covers?: readonly string[];
  /** Seed for placeholder covers when there are none, and behind covers while they load. */
  seed?: string;
  /** Fill the positioned parent instead of sizing itself as a square. */
  fill?: boolean;
  /** Layout placement only. */
  className?: string;
}

/**
 * Playlist art: four track covers in one 3D row inside a square. The back covers fade into `surface`; no shadows.
 */
export function PlaylistStack({ covers, seed, fill = false, className = '' }: PlaylistStackProps) {
  const layers = stackCovers(covers, seed);
  const box = fill ? 'absolute inset-0' : 'relative aspect-square w-full';

  if (layers.length === 1) {
    return <Artwork src={layers[0]!.src} seed={seed} fill={fill} className={className} />;
  }

  return (
    <div className={`${box} overflow-hidden rounded-tile bg-surface ${className}`}>
      <div className="absolute inset-0" style={STACK_SCENE_STYLE}>
        {layers.map((layer, i) => (
          <div
            key={i}
            className="absolute overflow-hidden rounded-[10px] bg-surface2"
            style={{
              ...stackLayerStyle(i),
              ...(layer.background ? { background: layer.background } : {}),
            }}
          >
            {layer.src && (
              <img
                src={layer.src}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 size-full object-cover"
              />
            )}
            {i > 0 && (
              <div
                className="absolute inset-0 bg-surface"
                style={{ opacity: stackOverlayOpacity(i) }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
