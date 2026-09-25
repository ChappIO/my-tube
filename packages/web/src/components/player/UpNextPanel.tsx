import { formatLength } from '../../format';
import type { Player, PlayerItem } from '../../player-state';
import { Artwork } from '../media';
import { cx, focusRingInset } from '../ui/cx';

/** `3 of 8`: the Up next header's position. */
export function upNextLabel(player: Player): string {
  return `${player.index + 1} of ${player.queue.length}`;
}

/** `NASA · 2 days ago` under an Up next title. */
export function upNextSub(item: PlayerItem): string {
  return item.when ? `${item.sub} · ${item.when}` : item.sub;
}

/**
 * Now Playing's Up next for video (the aside, or below the frame in theater mode and below
 * 1180px): the queue panel's box (`line` border, radius 14, a `surface` header "UP NEXT" with
 * `3 of 8`) over one row per video: the 16/9 thumbnail (radius 6) with its length, the title
 * (Archivo 600 13, two lines, red when current) over `channel · when`. A row jumps there and
 * plays; the current row sits on `surface`.
 */
export function UpNextPanel({
  player,
  onJump,
}: {
  player: Player;
  onJump: (index: number) => void;
}) {
  return (
    <section
      aria-label="Up next"
      className="min-w-0 self-start overflow-hidden rounded-card border border-line"
    >
      <header className="flex items-center justify-between gap-3 bg-surface px-4 py-[14px]">
        <h2 className="font-mono text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
          Up next
        </h2>
        <span className="font-mono text-[12px] text-muted">{upNextLabel(player)}</span>
      </header>
      <ol>
        {player.queue.map((item, index) => (
          <UpNextRow
            key={`${index}:${item.kind}:${item.id}`}
            item={item}
            current={index === player.index}
            onJump={() => onJump(index)}
          />
        ))}
      </ol>
    </section>
  );
}

function UpNextRow({
  item,
  current,
  onJump,
}: {
  item: PlayerItem;
  current: boolean;
  onJump: () => void;
}) {
  return (
    <li className="border-t border-line">
      <button
        type="button"
        onClick={onJump}
        aria-current={current || undefined}
        className={cx(
          'grid w-full cursor-pointer grid-cols-[96px_minmax(0,1fr)] items-start gap-3 px-[14px] py-[10px] text-left',
          current ? 'bg-surface' : 'hover:bg-surface',
          focusRingInset,
        )}
      >
        <span className="relative aspect-video overflow-hidden rounded-[6px] bg-surface">
          <Artwork fill size="flush" src={item.artUrl ?? undefined} seed={item.title} />
          {item.dur > 0 && (
            <span className="absolute right-1 bottom-1 rounded-badge bg-ink px-1 font-mono text-[9px] leading-[14px] font-bold text-bg">
              {formatLength(item.dur)}
            </span>
          )}
        </span>
        <span className="grid min-w-0 gap-[2px]">
          <span
            className={cx(
              'line-clamp-2 font-sans text-[13px] leading-[1.3] font-semibold',
              current ? 'text-red' : 'text-ink',
            )}
          >
            {item.title}
          </span>
          <span className="truncate font-sans text-[12px] text-muted">{upNextSub(item)}</span>
        </span>
      </button>
    </li>
  );
}
