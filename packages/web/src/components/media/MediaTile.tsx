import type { ReactNode } from 'react';
import { cx, focusRingInset, focusRingOverlay } from '../ui/cx';
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
  /** Channel name in the secondary line; a button when `onOpenChannel` is set. */
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

/**
 * The square media tile (Home, Videos tab, channel page). Always square, `surface` box,
 * radius 12; the art is rounded on all corners and sits on the chin. Hover lifts it with
 * `scale(1.04)` and the tile shadow.
 *
 * Overlay pattern, so no interactive control is nested in another: the tile itself is a plain
 * box, a full-size transparent `<button>` (the only control for `onOpen`, named by the title)
 * lies over it, and the channel name is a separate button above the overlay. Art and chin let
 * clicks through to the overlay. Keyboard order is tile, then channel.
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
  className,
}: MediaTileProps) {
  const reveal = chin === 'reveal';

  return (
    <div
      className={cx(
        'group relative flex aspect-square flex-col overflow-hidden rounded-tile bg-surface hover:scale-[1.04] hover:shadow-tile',
        'motion-tile',
        focusRingOverlay,
        className,
      )}
    >
      {onOpen && (
        <button
          type="button"
          data-overlay
          aria-label={title}
          onClick={onOpen}
          // The ring is drawn on the tile (focusRingOverlay); the overlay itself stays invisible.
          className="absolute inset-0 z-0 cursor-pointer rounded-tile outline-none"
        />
      )}

      <div className="pointer-events-none relative z-[1] min-h-0 flex-1 overflow-hidden rounded-tile">
        {art}
        {duration && <DurationBadge duration={duration} />}
      </div>

      <div
        className={cx(
          'pointer-events-none z-[2] bg-surface',
          reveal
            ? 'absolute inset-x-0 -bottom-px translate-y-full group-focus-within:translate-y-0 group-hover:translate-y-0 motion-chin'
            : 'relative flex-none',
        )}
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
                      onClick={onOpenChannel}
                      className={cx(
                        'pointer-events-auto max-w-full cursor-pointer truncate rounded-badge align-bottom hover:text-red hover:underline',
                        // Inset: the ellipsis line clips anything drawn outside it.
                        focusRingInset,
                      )}
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
