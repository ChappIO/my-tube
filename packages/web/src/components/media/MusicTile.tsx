import type { KeyboardEvent } from 'react';
import { BellIcon } from '../icons';
import { Artwork } from './Artwork';
import { PlaylistStack } from './PlaylistStack';

export interface MusicTileProps {
  /** Albums and playlists are left-aligned squares; artists are centered circles. */
  kind: 'album' | 'artist' | 'playlist';
  title: string;
  /** Artist for albums, `Yours` / `Synced from YouTube` for playlists; none for artists. */
  subtitle?: string;
  /** Meta line, for example `2007 · 10 tracks` or `9 albums · 112 tracks`. */
  meta?: string;
  /** Some tracks are missing: the meta line turns red (`12/14 tracks`). */
  incomplete?: boolean;
  /** Artist subscription: shows the bell badge on the avatar. Ignored for albums and playlists. */
  subscribed?: boolean;
  /** Cover or avatar URL (albums, artists). */
  src?: string;
  /** Track cover URLs for the playlist stack. */
  covers?: readonly string[];
  /** Placeholder seed when there is no art. */
  seed?: string;
  /** Opens the item. */
  onOpen?: () => void;
  /** Layout placement only. */
  className?: string;
}

// Handoff motion for the open tile: `transform .2s ease, background .2s ease`.
const TILE_MOTION = 'transition-[scale,background-color] duration-200 ease-[ease]';

/**
 * The open music tile (Music tab): no box, art with text below. Hover scales it to 1.03 and
 * puts `surface` behind the whole tile.
 */
export function MusicTile({
  kind,
  title,
  subtitle,
  meta,
  incomplete = false,
  subscribed = false,
  src,
  covers,
  seed,
  onOpen,
  className = '',
}: MusicTileProps) {
  const artist = kind === 'artist';

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen?.();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`grid cursor-pointer gap-3 rounded-card hover:scale-[1.03] hover:bg-surface ${artist ? 'p-3 text-center' : 'p-2.5 text-left'} ${TILE_MOTION} ${className}`}
    >
      <div className="relative">
        {kind === 'playlist' ? (
          <PlaylistStack covers={covers} seed={seed} />
        ) : (
          <Artwork src={src} seed={seed} shape={artist ? 'circle' : 'square'} />
        )}
        {artist && subscribed && <BellBadge />}
      </div>
      <div className="min-w-0">
        <div className="text-tile-title text-pretty">{title}</div>
        {subtitle && <div className="mt-0.5 text-tile-meta text-muted">{subtitle}</div>}
        {meta && (
          <div className={`mt-1.5 truncate text-meta-sm ${incomplete ? 'text-red' : 'text-muted'}`}>
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Subscribed-artist badge: 28px red circle with a 14px white bell and a 3px `bg` ring, its
 * center on the avatar's edge at 45° (top/right `calc(14.6% − 14px)`).
 */
function BellBadge() {
  return (
    <span
      role="img"
      aria-label="Subscribed"
      className="absolute top-[calc(14.6%-14px)] right-[calc(14.6%-14px)] grid size-7 place-items-center rounded-full bg-red text-white shadow-[0_0_0_3px_var(--color-bg)]"
    >
      <BellIcon size={14} />
    </span>
  );
}
