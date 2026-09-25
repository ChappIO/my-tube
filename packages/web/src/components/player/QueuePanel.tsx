import { formatLength } from '../../format';
import { type Player, type PlayerItem, queueLabel } from '../../player-state';
import { cx, focusRingInset } from '../ui/cx';

/** What the first column of a queue row shows: the number, or ▶ / ❙❙ on the current item. */
export function queueRowMarker(index: number, player: Player): string {
  if (index !== player.index) return String(index + 1).padStart(2, '0');
  return player.playing ? '▶' : '❙❙';
}

/**
 * Now Playing's queue (the aside): a bordered radius-14 panel with a `surface` header ("QUEUE"
 * and `3 of 10 · In Rainbows`) over one row per item: the number (▶ or ❙❙ in red on the current
 * one), the title (red when current) over the sub, the length. A row jumps there and plays;
 * the current row sits on `surface`. Items not on disk show muted and do nothing.
 */
export function QueuePanel({
  player,
  onJump,
}: {
  player: Player;
  onJump: (index: number) => void;
}) {
  return (
    <section
      aria-label="Queue"
      className="min-w-0 self-start overflow-hidden rounded-card border border-line"
    >
      <header className="flex items-center justify-between gap-3 bg-surface px-4 py-[14px]">
        <h2 className="font-mono text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
          Queue
        </h2>
        <span className="truncate font-mono text-[12px] text-muted">{queueLabel(player)}</span>
      </header>
      <ol>
        {player.queue.map((item, index) => (
          <QueueRow
            // The same track can be in the queue twice (added again).
            key={`${index}:${item.kind}:${item.id}`}
            item={item}
            marker={queueRowMarker(index, player)}
            current={index === player.index}
            onJump={() => onJump(index)}
          />
        ))}
      </ol>
    </section>
  );
}

function QueueRow({
  item,
  marker,
  current,
  onJump,
}: {
  item: PlayerItem;
  marker: string;
  current: boolean;
  onJump: () => void;
}) {
  const missing = item.missing === true;
  return (
    <li className="border-t border-line">
      <button
        type="button"
        onClick={onJump}
        disabled={missing}
        aria-current={current || undefined}
        className={cx(
          'grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-[10px] text-left',
          current ? 'bg-surface' : 'enabled:hover:bg-surface',
          missing ? 'opacity-50' : 'cursor-pointer',
          focusRingInset,
        )}
      >
        <span className={cx('font-mono text-[12px]', current ? 'text-red' : 'text-muted')}>
          {marker}
        </span>
        <span className="grid min-w-0">
          <span
            className={cx(
              'truncate font-sans text-[14px] font-medium',
              current ? 'text-red' : 'text-ink',
            )}
          >
            {item.title}
          </span>
          <span className="truncate font-sans text-[12px] text-muted">
            {missing ? `${item.sub} · not on disk` : item.sub}
          </span>
        </span>
        <span className="font-mono text-[12px] text-muted">
          {item.dur > 0 ? formatLength(item.dur) : '—'}
        </span>
      </button>
    </li>
  );
}
