import { Link, type LinkOptions } from '@tanstack/react-router';
import type { KeyboardEvent } from 'react';
import { BellIcon } from '../icons';
import { cx, focusRing } from '../ui/cx';
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
  /** A red count on the art's top right, for example `1 missing` (the artist page's albums). */
  badge?: string;
  /** The album is pinned (the user asked for all of it): a `pinned` chip on the art's top left. */
  pinned?: boolean;
  /** Cover or avatar URL (albums, artists). */
  src?: string;
  /** Track cover URLs for the playlist stack. */
  covers?: readonly string[];
  /** Placeholder seed when there is no art. */
  seed?: string;
  /** Opens the item (plays it). */
  onOpen?: () => void;
  /**
   * The item's page, built with `linkOptions` (albums: the album page). The tile renders as a
   * link instead of a button; `onOpen` is ignored.
   */
  link?: LinkOptions;
  /** Layout placement only. */
  className?: string;
}

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
  badge,
  pinned = false,
  src,
  covers,
  seed,
  onOpen,
  link,
  className,
}: MusicTileProps) {
  const artist = kind === 'artist';

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen?.();
    }
  }

  const tileClass = (interactive: boolean) =>
    cx(
      'grid min-w-0 content-start gap-3 rounded-card hover:scale-[1.03] hover:bg-surface',
      'motion-tile',
      interactive && cx('cursor-pointer', focusRing),
      artist ? 'p-3 text-center' : 'p-2.5 text-left',
      className,
    );
  const content = (
    <>
      <div className="relative">
        {kind === 'playlist' ? (
          <PlaylistStack covers={covers} seed={seed} />
        ) : (
          <Artwork src={src} seed={seed} shape={artist ? 'circle' : 'square'} />
        )}
        {artist && subscribed && <BellBadge />}
        {pinned && <PinnedChip className="absolute top-2.5 left-2.5" />}
        {badge && <MissingBadge text={badge} />}
      </div>
      <div className="min-w-0">
        <div className="text-tile-title text-pretty">{title}</div>
        {subtitle && <div className="mt-0.5 text-tile-meta text-muted">{subtitle}</div>}
        {meta && (
          <div
            className={cx('mt-1.5 truncate text-meta-sm', incomplete ? 'text-red' : 'text-muted')}
          >
            {meta}
          </div>
        )}
      </div>
    </>
  );

  // With `link` the tile is a link to a page (albums open the album page).
  if (link) {
    return (
      <Link {...link} className={tileClass(true)}>
        {content}
      </Link>
    );
  }

  // Without `onOpen` or `link` the tile is plain content, not a button.
  const interactive = onOpen !== undefined;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={interactive ? handleKeyDown : undefined}
      className={tileClass(interactive)}
    >
      {content}
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

/** The red count on an album's art, top right: Space Mono 700 11, white on red, a pill. */
function MissingBadge({ text }: { text: string }) {
  return (
    <span className="absolute top-2.5 right-2.5 rounded-pill bg-red px-2 py-[3px] text-nav-badge text-white">
      {text}
    </span>
  );
}

/**
 * The `pinned` chip: Space Mono 11 on a `surface` pill, like a rule chip. On a pinned album's
 * tile (the artist page) and in the album page header.
 */
export function PinnedChip({ className }: { className?: string }) {
  return (
    <span
      title="Kept whatever the rules say"
      className={cx('rounded-pill bg-surface px-2 py-[3px] text-meta-sm text-ink', className)}
    >
      pinned
    </span>
  );
}
