import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { DurationBadge } from './DurationBadge';

export interface MediaTileProps {
  title: string;
  /**
   * `fixed`: the chin sits below the art and is always visible; the art shrinks to fill the
   * rest of the square (video tiles). `reveal`: the art fills the square and the chin slides
   * up over it on hover or focus (music and playlist tiles on Home).
   */
  chin: 'fixed' | 'reveal';
  /** The art: `<Artwork fill …/>` or `<PlaylistStack fill …/>`. */
  art: ReactNode;
  /** Video length, shown as a badge on the art. */
  duration?: string;
  /** Channel name in the secondary line; a link when `onOpenChannel` is set. */
  channel?: string;
  /** Relative date after the channel, for example `2 days ago`. */
  when?: string;
  /** Plain secondary line for tiles without a channel, for example `Carole King · 12 tracks`. */
  subtitle?: string;
  /** Opens the item (Preview). */
  onOpen?: () => void;
  /** Opens the channel page. Does not open the tile. */
  onOpenChannel?: () => void;
  /** Layout placement only. */
  className?: string;
}

// Motion from the handoff: tile hover `transform .2s ease, box-shadow .2s ease`, chin reveal
// `transform .2s ease`. Tailwind 4 scales and translates through the `scale` and `translate`
// properties, so those are what transition.
const TILE_MOTION = 'transition-[scale,box-shadow] duration-200 ease-[ease]';
const CHIN_MOTION = 'transition-[translate] duration-200 ease-[ease]';

/**
 * The square media tile (Home, Videos tab, channel page). Always square, `surface` box,
 * radius 12; the art is rounded on all corners and sits on the chin. Hover lifts it with
 * `scale(1.04)` and the tile shadow.
 */
export function MediaTile({
  title,
  chin,
  art,
  duration,
  channel,
  when,
  subtitle,
  onOpen,
  onOpenChannel,
  className = '',
}: MediaTileProps) {
  const reveal = chin === 'reveal';

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keys pressed on the channel link belong to the link.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen?.();
    }
  }

  function handleChannelClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onOpenChannel?.();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className={`group relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded-tile bg-surface hover:scale-[1.04] hover:shadow-tile ${TILE_MOTION} ${className}`}
    >
      <div className="relative z-[1] min-h-0 flex-1 overflow-hidden rounded-tile">
        {art}
        {duration && <DurationBadge duration={duration} />}
      </div>

      <div
        className={
          reveal
            ? `absolute inset-x-0 -bottom-px z-[2] translate-y-full bg-surface group-focus-within:translate-y-0 group-hover:translate-y-0 ${CHIN_MOTION}`
            : 'relative z-[2] flex-none bg-surface'
        }
      >
        {reveal && <ConcaveCorners />}
        <div className="px-3 pt-2.5 pb-3">
          <div className="line-clamp-2 font-sans text-[13px] leading-[1.3] font-semibold text-pretty">
            {title}
          </div>
          {(channel || subtitle) && (
            <div className="mt-[3px] truncate text-tile-meta text-muted">
              {channel ? (
                <>
                  {onOpenChannel ? (
                    <button
                      type="button"
                      onClick={handleChannelClick}
                      className="max-w-full cursor-pointer truncate align-bottom hover:text-red hover:underline"
                    >
                      {channel}
                    </button>
                  ) : (
                    channel
                  )}
                  {when && ` · ${when}`}
                </>
              ) : (
                subtitle
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The overlaid chin's inverted corners: two 12px `surface` pieces above its top edge whose
 * transparent quarter circles continue the art's rounded bottom corners.
 */
function ConcaveCorners() {
  return (
    <>
      <div
        aria-hidden
        className="absolute -top-3 left-0 size-3"
        style={{
          background:
            'radial-gradient(circle at 100% 0%, transparent 12px, var(--color-surface) 12.5px)',
        }}
      />
      <div
        aria-hidden
        className="absolute -top-3 right-0 size-3"
        style={{
          background:
            'radial-gradient(circle at 0% 0%, transparent 12px, var(--color-surface) 12.5px)',
        }}
      />
    </>
  );
}
