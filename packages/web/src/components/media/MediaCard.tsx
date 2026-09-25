import type { MouseEvent, ReactNode } from 'react';
import { cx, focusRingInset, focusRingOverlay } from '../ui/cx';
import { DurationBadge } from './DurationBadge';

export interface MediaCardProps {
  title: string;
  /** The 16:9 art: `<Artwork fill …/>`. */
  art: ReactNode;
  /** Video length, shown as a badge on the art. */
  duration?: string;
  /**
   * The 36px round avatar in front of the text: `<Artwork fill shape="circle" …/>`. Without it
   * the text takes the full width (the channel page, where the channel is the page).
   */
  avatar?: ReactNode;
  /** Channel name at the start of the meta line; a link when `channelHref` is set. */
  channel?: string;
  /** Where the channel name links to, for example `/video/channel/3`. */
  channelHref?: string;
  /**
   * Opens the channel page in the app (client-side navigation). A plain click calls it
   * instead of following `channelHref`; modified clicks (new tab, new window) keep the link.
   */
  onOpenChannel?: () => void;
  /** Relative date, after the channel: `2 weeks ago`. */
  when?: string;
  /** Opens the item (plays it). */
  onOpen?: () => void;
  /** Layout placement only. */
  className?: string;
}

/**
 * The wide video card (Videos tab, channel page): a 16:9 thumbnail with the duration badge,
 * and below it the round channel avatar next to the title (2 lines) and the meta line
 * `Channel · 2 weeks ago`. No box; hover `scale(1.02)`.
 *
 * Overlay pattern, as `MediaTile`: a full-size transparent `<button data-overlay>` named by the
 * title is the only control for `onOpen`; art and text let clicks through to it. The channel
 * name is a separate link above the overlay, so clicking it never reaches the overlay (and it
 * stops propagation anyway). Keyboard order is card, then channel.
 */
export function MediaCard({
  title,
  art,
  duration,
  avatar,
  channel,
  channelHref,
  onOpenChannel,
  when,
  onOpen,
  className,
}: MediaCardProps) {
  return (
    <div
      className={cx(
        'relative min-w-0 rounded-tile hover:scale-[1.02]',
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
          // The ring is drawn on the card (focusRingOverlay); the overlay itself stays invisible.
          className="absolute inset-0 z-0 cursor-pointer rounded-tile outline-none"
        />
      )}

      <div className="pointer-events-none relative z-[1] aspect-video overflow-hidden rounded-tile">
        {art}
        {duration && <DurationBadge duration={duration} />}
      </div>

      <div
        className={cx(
          'pointer-events-none relative z-[1] mt-3 grid gap-3',
          avatar ? 'grid-cols-[36px_1fr]' : 'grid-cols-1',
        )}
      >
        {avatar && (
          <div data-avatar className="relative size-9">
            {avatar}
          </div>
        )}
        <div className="min-w-0">
          <div className="line-clamp-2 text-tile-title text-pretty">{title}</div>
          {(channel || when) && (
            <div className="mt-[3px] truncate text-tile-meta text-muted">
              {channel && <ChannelLink name={channel} href={channelHref} onOpen={onOpenChannel} />}
              {channel && when && ' · '}
              {when}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ChannelLinkProps {
  name: string;
  href?: string;
  onOpen?: () => void;
}

/** The channel name in the meta line: a link above the overlay, or plain text without `href`. */
function ChannelLink({ name, href, onOpen }: ChannelLinkProps) {
  if (href === undefined) return name;
  return (
    <a
      href={href}
      onClick={(event) => channelLinkClick(event, onOpen)}
      className={cx(
        'pointer-events-auto rounded-badge hover:text-red hover:underline',
        // Inset: the ellipsis line clips anything drawn outside it.
        focusRingInset,
      )}
    >
      {name}
    </a>
  );
}

/**
 * The channel link's click: never reaches the card (nothing starts playing); a plain left click
 * navigates in the app through `onOpen`, a modified one is left to the browser.
 */
export function channelLinkClick(
  event: Pick<
    MouseEvent,
    'stopPropagation' | 'preventDefault' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'
  >,
  onOpen: (() => void) | undefined,
) {
  event.stopPropagation();
  if (onOpen === undefined) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  event.preventDefault();
  onOpen();
}
