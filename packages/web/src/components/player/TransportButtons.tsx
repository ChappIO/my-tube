import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../icons';
import { cx, focusRingOnRed, hitArea } from '../ui/cx';

export interface TransportButtonsProps {
  playing: boolean;
  /** Waiting for data: a spinner replaces the glyph in the play circle. */
  buffering: boolean;
  onPrev: () => void;
  onToggle: () => void;
  onNext: () => void;
  /**
   * `spacious` (wide bar): prev (40px, 20px glyph) · play (48px white circle, 24px red glyph) ·
   * next. `compact` (narrow bar): play (34px) · next; previous is hidden.
   */
  size: 'spacious' | 'compact';
}

/**
 * The bar's transport, the only play and pause control of the player (the design keeps them out
 * of the card, the tiles and Now Playing). Prev and next hover a translucent white circle.
 */
export function TransportButtons({
  playing,
  buffering,
  onPrev,
  onToggle,
  onNext,
  size,
}: TransportButtonsProps) {
  const compact = size === 'compact';
  const step = cx(
    'grid shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-on-red-hover',
    compact ? 'size-[34px]' : 'size-10',
    hitArea,
    focusRingOnRed,
  );
  const glyph = compact ? 18 : 20;
  return (
    <div className={cx('flex items-center', compact ? 'gap-1' : 'gap-3')}>
      {!compact && (
        <button
          type="button"
          aria-label="Previous"
          title="Previous"
          onClick={onPrev}
          className={step}
        >
          <PreviousIcon size={glyph} />
        </button>
      )}
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        aria-busy={buffering || undefined}
        onClick={onToggle}
        className={cx(
          'grid shrink-0 cursor-pointer place-items-center rounded-full bg-white text-red',
          compact ? 'size-[34px]' : 'size-12',
          hitArea,
          focusRingOnRed,
        )}
      >
        {buffering ? (
          <Spinner size={compact ? 16 : 22} />
        ) : playing ? (
          <PauseIcon size={compact ? 18 : 24} />
        ) : (
          <PlayIcon size={compact ? 18 : 24} />
        )}
      </button>
      <button type="button" aria-label="Next" title="Next" onClick={onNext} className={step}>
        <NextIcon size={glyph} />
      </button>
    </div>
  );
}

/** The buffering spinner: a red ring with a gap, turning (`motion-spin`). */
function Spinner({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      className="motion-spin rounded-full border-2 border-red border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}
