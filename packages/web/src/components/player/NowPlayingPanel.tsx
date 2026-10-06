import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import type { PlayerItem } from '../../player-state';
import { Artwork } from '../media';
import { cx, focusRing } from '../ui/cx';
import { Meta } from '../ui/typography';
import { BlurredCover } from './BlurredCover';
import { FullscreenButton } from './ControlStrip';
import { barSubLine } from './PlayerBar';
import { VisualizerCanvas } from './VisualizerCanvas';
import { useFullscreen } from './useFullscreen';

/** The caption under the panel. */
export const VISUALIZER_CAPTION = 'Visualizer · colours picked from the cover';

/**
 * Now Playing's music panel: 16/10 (1/1 narrow), radius 18, `player` black. Layers, bottom to
 * top: the cover blurred and darkened as the background (`BlurredCover`: baked once into a small
 * canvas, not a CSS filter the compositor would redo every frame), the visualizer canvas, and
 * the overlay along the bottom (the 72px
 * cover, a link to the album page, beside the title and `artist · album` in white over a dark
 * fade). The caption sits under the panel, the Fullscreen pill right of it: fullscreen is the
 * panel (cover, visualizer, overlay); the bar stays outside, and the keyboard still plays.
 */
export function NowPlayingPanel({ item }: { item: PlayerItem }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(panelRef);
  return (
    <div className="grid gap-3">
      <div
        ref={panelRef}
        className={cx(
          'relative overflow-hidden bg-player',
          fullscreen.active
            ? 'size-full rounded-none'
            : 'aspect-square rounded-modal wide:aspect-[16/10]',
        )}
      >
        <BlurredCover artUrl={item.artUrl} />
        <VisualizerCanvas artUrl={item.artUrl} className="absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-[18px] bg-linear-to-t from-player-fade-panel to-transparent px-5 pt-16 pb-5 text-white wide:px-7 wide:pb-6">
          <CoverLink item={item} />
          <div className="grid min-w-0 gap-1">
            <h1 className="font-sans text-[22px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance wide:text-[30px]">
              {item.title}
            </h1>
            <p className="truncate font-sans text-[14px] opacity-85">{barSubLine(item)}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Meta as="p">{VISUALIZER_CAPTION}</Meta>
        <FullscreenButton
          supported={fullscreen.supported}
          active={fullscreen.active}
          onToggle={fullscreen.toggle}
        />
      </div>
    </div>
  );
}

/** The 72px cover: a link to the album page (plain art for a track without an album). */
function CoverLink({ item }: { item: PlayerItem }) {
  const art = (
    <Artwork size="flush" src={item.artUrl ?? undefined} seed={item.album ?? item.title} />
  );
  const box = 'block size-[72px] shrink-0 overflow-hidden rounded-[10px] shadow-player-cover';
  if (item.albumId === undefined) return <span className={box}>{art}</span>;
  return (
    <Link
      to="/music/album/$id"
      params={{ id: String(item.albumId) }}
      aria-label={`Open the album ${item.album ?? ''}`.trim()}
      className={cx(box, focusRing)}
    >
      {art}
    </Link>
  );
}
