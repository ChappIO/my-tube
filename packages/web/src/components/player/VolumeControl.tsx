import { useState } from 'react';
import {
  VOLUME_STEP,
  changeVolume,
  isSilent,
  playerState,
  setVolume,
  settleVolume,
  shownVolume,
  toggleMute,
} from '../../player-state';
import { MutedIcon, VolumeIcon } from '../icons';
import { cx, focusRingNone, focusRingOnRed, hitArea } from '../ui/cx';
import { seekPosition } from './Scrubber';

/** The volume a press at `x` on a track from `left` spanning `width` points at, 0 to 1. */
export function volumeAt(x: number, left: number, width: number): number {
  return seekPosition(x, left, width, 1);
}

/** The pointer and key events the slider needs (a DOM element; plain objects in tests). */
export interface VolumeEvent {
  button: number;
  clientX: number;
  pointerId: number;
  currentTarget: {
    getBoundingClientRect: () => { left: number; width: number };
    setPointerCapture: (id: number) => void;
    hasPointerCapture: (id: number) => boolean;
  };
}

/**
 * The slider's handlers: a press sets the volume where it lands and captures the pointer, a
 * captured move follows it, the release settles the drag (`onSettle` with the level it started
 * at, so unmuting after a drag to 0 goes back there), ← → step 5 % (and stay out of the global
 * ±10 s seek).
 */
export function volumeSliderHandlers(
  onVolume: (volume: number) => void,
  onStep: (delta: number) => void,
  onSettle: (startedAt: number) => void = () => undefined,
  current: () => number = () => 0,
) {
  let startedAt: number | null = null;
  const at = (event: VolumeEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return volumeAt(event.clientX, rect.left, rect.width);
  };
  return {
    onPointerDown: (event: VolumeEvent) => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      startedAt = current();
      onVolume(at(event));
    },
    onPointerUp: () => {
      if (startedAt !== null) onSettle(startedAt);
      startedAt = null;
    },
    onPointerMove: (event: VolumeEvent) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) onVolume(at(event));
    },
    onKeyDown: (event: {
      key: string;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => {
      const delta =
        event.key === 'ArrowRight' ? VOLUME_STEP : event.key === 'ArrowLeft' ? -VOLUME_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      event.stopPropagation();
      onStep(delta);
    },
  };
}

/**
 * The bar's volume (wide screens only; the bar's wide row is not rendered below 760px, where
 * phones use their hardware buttons): a 32px mute button (`VolumeIcon`, or `MutedIcon` while
 * muted or at 0) and an 88px slider styled like the scrubber (18px hit height, 4px `on-red-track`
 * track, white fill, 12px white knob). Press and drag set the volume (pointer capture); ← → step
 * 5 % while it has focus. No outline: the knob shows where it is.
 */
export function VolumeControl({ volume, muted }: { volume: number; muted: boolean }) {
  const silent = isSilent({ volume, muted });
  const shown = shownVolume({ volume, muted });
  const percent = `${shown * 100}%`;
  const [handlers] = useState(() =>
    volumeSliderHandlers(setVolume, changeVolume, settleVolume, () => shownVolume(playerState())),
  );
  const label = silent ? 'Unmute' : 'Mute';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={label}
        title={`${label} (M)`}
        aria-pressed={silent}
        onClick={toggleMute}
        className={cx(
          'grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-on-red-hover',
          hitArea,
          focusRingOnRed,
        )}
      >
        {silent ? <MutedIcon size={18} /> : <VolumeIcon size={18} />}
      </button>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown * 100)}
        aria-valuetext={silent ? 'muted' : `${Math.round(shown * 100)}%`}
        {...handlers}
        className={cx(
          'relative flex h-[18px] w-[88px] shrink-0 cursor-pointer touch-none items-center',
          focusRingNone,
        )}
      >
        <div className="relative h-1 w-full overflow-hidden rounded-[2px] bg-on-red-track">
          <div className="absolute inset-y-0 left-0 bg-white" style={{ width: percent }} />
        </div>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 size-3 -translate-1/2 rounded-full bg-white"
          style={{ left: percent }}
        />
      </div>
    </div>
  );
}
