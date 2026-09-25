import { type Player, type PlayerItem, currentItem, next, upNext } from '../../player-state';
import { NextIcon, PlayIcon } from '../icons';
import { Artwork } from '../media';
import { cx, focusRing, focusRingInset } from '../ui/cx';
import { progressFraction } from './Scrubber';
import { SubtitleLayer } from './VideoFrame';
import { VideoSurface } from './VideoSurface';
import { useCaption } from './subtitles';

/** The card's width per kind: 260 for a cover, 320 for the video surface. */
export const CARD_WIDTHS = { music: 260, video: 320 } as const;

export interface FloatingCardProps {
  player: Player;
  onOpenNowPlaying: () => void;
  onDismiss: () => void;
}

/**
 * The floating card (poster): fixed above the bar on the right (wide screens only; narrow ones
 * open Now Playing from the bar's art). It appears with every new queue and stays until its ×
 * or Now Playing, which hides it. The art block opens Now Playing; the Up next row skips ahead.
 *
 * The art block is the one kind-specific part: music shows the square cover (`MusicCardArt`),
 * video the 16/9 `<video>` surface (`VideoCardArt`, 320 wide), with the same bottom overlay,
 * progress line and ×.
 */
export function FloatingCard({ player, onOpenNowPlaying, onDismiss }: FloatingCardProps) {
  const item = currentItem(player);
  if (!item) return null;
  return (
    <aside
      aria-label="Now playing"
      style={{ width: CARD_WIDTHS[player.kind] }}
      className="fixed right-4 bottom-[calc(16px+var(--player-bar-height,118px)+12px)] z-[8] hidden overflow-hidden rounded-[16px] bg-player-card text-white shadow-player-card wide:block"
    >
      <div className="relative">
        {item.kind === 'video' ? (
          <VideoCardArt
            item={item}
            pos={player.pos}
            playing={player.playing}
            onOpen={onOpenNowPlaying}
          />
        ) : (
          <MusicCardArt
            item={item}
            progress={progressFraction(player.pos, item.dur)}
            onOpen={onOpenNowPlaying}
          />
        )}
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={onDismiss}
          className={cx(
            'absolute top-[10px] right-[10px] z-[2] grid size-[26px] cursor-pointer place-items-center rounded-full bg-player-dismiss font-mono text-[13px] leading-none text-white',
            focusRing,
          )}
        >
          ×
        </button>
      </div>
      <UpNextRow item={upNext(player)} onNext={next} />
    </aside>
  );
}

/**
 * The music art block: the square cover (a button to Now Playing) with the bottom overlay
 * (title Archivo 800 15, sub Archivo 12 at .8 over a dark fade) and the 3px red progress line
 * along its bottom edge.
 */
function MusicCardArt({
  item,
  progress,
  onOpen,
}: {
  item: PlayerItem;
  progress: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Now Playing: ${item.title}`}
      onClick={onOpen}
      className={cx('relative block aspect-square w-full cursor-pointer text-left', focusRingInset)}
    >
      <Artwork fill src={item.artUrl ?? undefined} seed={item.album ?? item.title} size="flush" />
      <CardTitle item={item} />
      <ProgressLine progress={progress} />
    </button>
  );
}

/**
 * The video art block (the picture-in-picture surface): 16/9 with the one `<video>` in it, a
 * button to Now Playing over it. Paused: the 34px play glyph over a dark veil. Playing with
 * captions on: the caption line 64px above the bottom. Then the bottom overlay and the 3px
 * progress line, as for music.
 */
function VideoCardArt({
  item,
  pos,
  playing,
  onOpen,
}: {
  item: PlayerItem;
  pos: number;
  playing: boolean;
  onOpen: () => void;
}) {
  const caption = useCaption(item, pos);
  return (
    <div className="relative aspect-video w-full bg-player">
      <VideoSurface kind="card" />
      {playing && <SubtitleLayer text={caption} variant="card" />}
      <button
        type="button"
        aria-label={`Now Playing: ${item.title}`}
        onClick={onOpen}
        className={cx('absolute inset-0 z-[1] block cursor-pointer text-left', focusRingInset)}
      >
        {!playing && (
          <span className="absolute inset-0 grid place-items-center bg-player-paused">
            <PlayIcon size={34} />
          </span>
        )}
        <CardTitle item={item} />
        <ProgressLine progress={progressFraction(pos, item.dur)} />
      </button>
    </div>
  );
}

/** The card art's bottom overlay: title (Archivo 800 15) and sub (Archivo 12 at .8) over a fade. */
function CardTitle({ item }: { item: PlayerItem }) {
  return (
    <span className="absolute inset-x-0 bottom-0 grid gap-[2px] bg-linear-to-t from-player-fade to-transparent px-[14px] pt-9 pb-3">
      <span className="truncate font-sans text-[15px] font-extrabold tracking-[-0.01em]">
        {item.title}
      </span>
      <span className="truncate font-sans text-[12px] opacity-80">{item.sub}</span>
    </span>
  );
}

/** The 3px progress line along the bottom edge of the card art. */
function ProgressLine({ progress }: { progress: number }) {
  return (
    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-player-line">
      <span className="block h-full bg-red" style={{ width: `${progress * 100}%` }} />
    </span>
  );
}

/**
 * The card's Up next row: 28px art (radius 5), `UP NEXT` over the title, the next glyph. A click
 * skips to it. At the end of the queue it reads "End of queue" over `surface` art and does
 * nothing.
 */
export function UpNextRow({ item, onNext }: { item: PlayerItem | null; onNext: () => void }) {
  return (
    <button
      type="button"
      onClick={onNext}
      disabled={item === null}
      aria-label={item ? `Up next: ${item.title}` : 'End of queue'}
      className={cx(
        'flex w-full items-center gap-3 px-[14px] py-[10px] text-left enabled:cursor-pointer enabled:hover:bg-player-card-hover',
        focusRingInset,
      )}
    >
      <span className="size-7 shrink-0 overflow-hidden rounded-[5px] bg-surface">
        {item && (
          <Artwork src={item.artUrl ?? undefined} seed={item.album ?? item.title} size="flush" />
        )}
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase opacity-60">
          Up next
        </span>
        <span className="truncate font-sans text-[12px] font-medium">
          {item ? item.title : 'End of queue'}
        </span>
      </span>
      <NextIcon size={14} className="opacity-70" />
    </button>
  );
}
