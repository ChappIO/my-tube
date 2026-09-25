import type { MouseEvent } from 'react';
import { formatLength } from '../../format';
import { cx, focusRingOnRed } from '../ui/cx';

export interface ScrubberProps {
  /** Seconds played. */
  pos: number;
  /** Seconds in total (0 while unknown: the fill stays empty and a click does nothing). */
  dur: number;
  onSeek: (pos: number) => void;
  /**
   * `bar`: the wide bar's row 2 (18px hit height, 4px track, white fill, 12px knob on the fill
   * edge). `line`: the narrow bar's 3px line along its top edge (10px hit area, no knob).
   */
  variant: 'bar' | 'line';
  className?: string;
}

/** The played fraction, 0 to 1. */
export function progressFraction(pos: number, dur: number): number {
  if (!(dur > 0) || !Number.isFinite(pos)) return 0;
  return Math.min(1, Math.max(0, pos / dur));
}

/** The position a click at `x` on a track from `left` spanning `width` points at. */
export function seekPosition(x: number, left: number, width: number, dur: number): number {
  if (!(width > 0) || !(dur > 0)) return 0;
  return Math.min(1, Math.max(0, (x - left) / width)) * dur;
}

/**
 * The player's scrubber: click (or tap) anywhere to seek; there is no dragging. A slider for
 * assistive technology; the global ← → keys move it by 10 s.
 */
export function Scrubber({ pos, dur, onSeek, variant, className }: ScrubberProps) {
  const fraction = progressFraction(pos, dur);
  const percent = `${fraction * 100}%`;
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (dur > 0) onSeek(seekPosition(event.clientX, rect.left, rect.width, dur));
  };
  const line = variant === 'line';
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.round(dur)}
      aria-valuenow={Math.round(pos)}
      aria-valuetext={`${formatLength(Math.floor(pos))} of ${formatLength(dur)}`}
      onClick={onClick}
      className={cx(
        'relative flex cursor-pointer items-center',
        line ? 'h-[10px] items-start' : 'h-[18px]',
        focusRingOnRed,
        className,
      )}
    >
      <div
        className={cx(
          'relative w-full overflow-hidden bg-on-red-track',
          line ? 'h-[3px]' : 'h-1 rounded-[2px]',
        )}
      >
        <div className="absolute inset-y-0 left-0 bg-white" style={{ width: percent }} />
      </div>
      {!line && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-3 -translate-1/2 rounded-full bg-white"
          style={{ left: percent }}
        />
      )}
    </div>
  );
}
