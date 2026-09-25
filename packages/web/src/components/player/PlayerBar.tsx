import { type ReactNode, useEffect, useRef } from 'react';
import { formatLength } from '../../format';
import {
  type Player,
  type PlayerItem,
  currentItem,
  next,
  prev,
  queueLabel,
  seek,
  togglePlay,
} from '../../player-state';
import { ChevronUpIcon, CloseIcon } from '../icons';
import { Artwork } from '../media';
import { cx, focusRingOnRed, hitArea } from '../ui/cx';
import { Scrubber } from './Scrubber';
import { TransportButtons } from './TransportButtons';
import { VolumeControl } from './VolumeControl';

/** The CSS variable the bar sets to its height (the card and the main column's padding use it). */
export const BAR_HEIGHT_VAR = '--player-bar-height';

export interface PlayerBarProps {
  player: Player;
  buffering: boolean;
  /** The load error line, shown in place of the sub line. */
  error: string | null;
  onOpenNowPlaying: () => void;
  onClose: () => void;
  /** Both engines' volume and mute (wide only: the mute button and slider left of the label). */
  volume?: number;
  muted?: boolean;
}

/** `artist · album` (music) or the channel (video): the bar's sub line. */
export function barSubLine(item: PlayerItem): string {
  return item.album ? `${item.sub} · ${item.album}` : item.sub;
}

/**
 * The player bar (spacious): fixed to the bottom of the window over every screen, red with white
 * text, radius 14, the bar shadow. It is the only place with transport controls.
 *
 * Wide: row 1 is the art and text (→ Now Playing) · prev, play/pause, next · the queue label
 * (`3 of 10 · In Rainbows`), the chevron (→ Now Playing) and × (stops and closes); row 2 is the
 * position, the scrubber and the length. Narrow (compact): one row of 34px art, `title · sub`,
 * play, next and ×, with the progress as a 3px line along the top edge; above the tab bar.
 *
 * It publishes its height as `--player-bar-height` for the card above it and the main column's
 * bottom padding.
 */
export function PlayerBar({
  player,
  buffering,
  error,
  onOpenNowPlaying,
  onClose,
  volume = 1,
  muted = false,
}: PlayerBarProps) {
  const ref = useBarHeight();
  const item = currentItem(player);
  if (!item) return null;
  const label = queueLabel(player);
  const sub = error ?? barSubLine(item);
  const transport = {
    playing: player.playing,
    buffering,
    onPrev: prev,
    onToggle: togglePlay,
    onNext: next,
  };
  return (
    <section
      ref={ref}
      aria-label="Player"
      className="fixed inset-x-[10px] bottom-[calc(66px+env(safe-area-inset-bottom))] z-[8] overflow-hidden rounded-card bg-red text-white shadow-player-bar wide:inset-x-4 wide:bottom-4"
    >
      {/* Wide: two rows. */}
      <div className="hidden gap-[6px] px-[18px] pt-[14px] pb-[10px] wide:grid">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-5">
          <NowPlayingLink item={item} onOpen={onOpenNowPlaying}>
            <span className="size-14 shrink-0 overflow-hidden rounded-[10px] shadow-player-art">
              <Artwork
                size="flush"
                src={item.artUrl ?? undefined}
                seed={item.album ?? item.title}
              />
            </span>
            <span className="grid min-w-0 gap-[2px]">
              <span className="truncate font-sans text-[17px] font-extrabold tracking-[-0.01em]">
                {item.title}
              </span>
              <span className="truncate font-sans text-[13px] opacity-85">{sub}</span>
            </span>
          </NowPlayingLink>
          <TransportButtons size="spacious" {...transport} />
          <div className="flex min-w-0 items-center justify-end gap-2">
            <VolumeControl volume={volume} muted={muted} />
            <span className="truncate font-mono text-[11px] opacity-90">{label}</span>
            <BarIconButton label="Open Now Playing" onClick={onOpenNowPlaying}>
              <ChevronUpIcon size={18} strokeWidth={2.5} />
            </BarIconButton>
            <BarIconButton label="Close player" onClick={onClose}>
              <CloseIcon size={18} />
            </BarIconButton>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="min-w-9 tabular-nums">{formatLength(Math.floor(player.pos))}</span>
          <Scrubber
            variant="bar"
            pos={player.pos}
            dur={item.dur}
            onSeek={seek}
            className="flex-1"
          />
          <span className="min-w-9 text-right tabular-nums">{formatLength(item.dur)}</span>
        </div>
      </div>

      {/* Narrow: one compact row under the 3px progress line. */}
      <div className="relative wide:hidden">
        <Scrubber
          variant="line"
          pos={player.pos}
          dur={item.dur}
          onSeek={seek}
          className="absolute inset-x-0 top-0 z-[1]"
        />
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 pt-[9px] pr-3 pb-[6px] pl-2">
          <NowPlayingLink item={item} onOpen={onOpenNowPlaying} compact>
            <span className="size-[34px] shrink-0 overflow-hidden rounded-[8px]">
              <Artwork
                size="flush"
                src={item.artUrl ?? undefined}
                seed={item.album ?? item.title}
              />
            </span>
          </NowPlayingLink>
          <span className="truncate font-sans text-[13px]">
            <span className="font-bold">{item.title}</span>
            <span className="opacity-85"> · {sub}</span>
          </span>
          <TransportButtons size="compact" {...transport} />
          <BarIconButton label="Close player" onClick={onClose}>
            <CloseIcon size={16} />
          </BarIconButton>
        </div>
      </div>
    </section>
  );
}

/** The art (and on wide screens the text) as one button that opens Now Playing. */
function NowPlayingLink({
  item,
  onOpen,
  compact = false,
  children,
}: {
  item: PlayerItem;
  onOpen: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`Now Playing: ${item.title}`}
      onClick={onOpen}
      className={cx(
        'flex min-w-0 cursor-pointer items-center text-left',
        compact ? 'rounded-[8px]' : 'gap-[14px] justify-self-start rounded-[10px]',
        focusRingOnRed,
      )}
    >
      {children}
    </button>
  );
}

/** A 32px round control on the bar (chevron, ×), hover translucent white. */
function BarIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-on-red-hover',
        hitArea,
        focusRingOnRed,
      )}
    >
      {children}
    </button>
  );
}

/** Publishes the bar's height on the document while it is mounted. */
function useBarHeight() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty(BAR_HEIGHT_VAR, `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(BAR_HEIGHT_VAR);
    };
  }, []);
  return ref;
}
