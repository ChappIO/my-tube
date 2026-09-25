import { useState } from 'react';
import { formatLength } from '../../format';
import { cx } from '../ui/cx';
import { progressFraction, seekPosition } from './Scrubber';

/** Where the pointer is on the track: its x and the track's box. */
export interface ScrubPoint {
  x: number;
  left: number;
  width: number;
}

export interface ScrubTarget {
  /** Seconds in total (0 while unknown: nothing happens). */
  dur: number;
  /**
   * The element seeks natively (a direct file): seek live while dragging. A remux seeks by
   * reloading, so it seeks once, on release.
   */
  live: boolean;
  /** Moves the playback (the store's `seek`). */
  onSeek: (pos: number) => void;
  /** The position to show while dragging; null when the drag ends. */
  onPreview: (pos: number | null) => void;
}

/**
 * One drag (or click) on the frame's scrubber: `start` on pointer down, `move` while the pointer
 * is captured, `end` on pointer up. Live targets seek on every new position; others only on
 * `end`, once. A click is a start and an end at the same place: one seek.
 */
export function createScrub(target: ScrubTarget) {
  let last: number | null = null;
  const at = (point: ScrubPoint) => seekPosition(point.x, point.left, point.width, target.dur);
  const show = (point: ScrubPoint) => {
    const pos = at(point);
    target.onPreview(pos);
    if (target.live && pos !== last) {
      target.onSeek(pos);
      last = pos;
    }
  };
  return {
    start: show,
    move: show,
    end(point: ScrubPoint) {
      const pos = at(point);
      target.onPreview(null);
      if (pos !== last) target.onSeek(pos);
      last = pos;
    },
  };
}

/** The pointer events the scrubber needs (a DOM element; plain objects in tests). */
export interface ScrubEvent {
  button: number;
  clientX: number;
  pointerId: number;
  stopPropagation: () => void;
  currentTarget: {
    getBoundingClientRect: () => { left: number; width: number };
    setPointerCapture: (id: number) => void;
    hasPointerCapture: (id: number) => boolean;
  };
}

/**
 * The scrubber's event handlers over `target`, keeping the drag in `drag` (a ref). Clicks and
 * pointer downs and ups never reach the frame (its click toggles play).
 */
export function scrubberHandlers(
  target: ScrubTarget,
  drag: { current: ReturnType<typeof createScrub> | null },
) {
  const point = (event: ScrubEvent): ScrubPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX, left: rect.left, width: rect.width };
  };
  return {
    onClick: (event: Pick<ScrubEvent, 'stopPropagation'>) => event.stopPropagation(),
    onPointerDown: (event: ScrubEvent) => {
      event.stopPropagation();
      if (!(target.dur > 0) || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = createScrub(target);
      drag.current.start(point(event));
    },
    onPointerMove: (event: ScrubEvent) => {
      if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
        drag.current.move(point(event));
      }
    },
    onPointerUp: (event: ScrubEvent) => {
      event.stopPropagation();
      drag.current?.end(point(event));
      drag.current = null;
    },
    onPointerCancel: () => {
      drag.current = null;
      target.onPreview(null);
    },
  };
}

export interface FrameScrubberProps {
  pos: number;
  dur: number;
  /** Seek live while dragging (a direct file); otherwise once on release (a remux). */
  live: boolean;
  onSeek: (pos: number) => void;
}

/**
 * The Now Playing frame's progress line as a scrubber: an 18px hit zone along the bottom edge
 * with the 4px line (`player-frame-track`, red fill) at its foot. On hover, keyboard focus or
 * while dragging the line grows to 8px (`motion-scrub`) and a 12px white knob shows on the fill
 * edge (`frameScrubberClasses`); that is its focus indication too, without an outline. A click seeks; a drag (pointer capture) shows the position as
 * it goes and seeks live for a direct file, once on release for a remux. Events stop here, so the
 * frame's click-to-toggle does not fire. A focusable slider: ← → go through the global shortcuts
 * (±10 s), so it handles no keys itself.
 */
export function FrameScrubber({ pos, dur, live, onSeek }: FrameScrubberProps) {
  const [preview, setPreview] = useState<number | null>(null);
  // A mutable box for the drag in progress: read and written by the event handlers only.
  const [drag] = useState<{ current: ReturnType<typeof createScrub> | null }>(() => ({
    current: null,
  }));
  const shown = preview ?? pos;
  const percent = `${progressFraction(shown, dur) * 100}%`;
  const classes = frameScrubberClasses(preview !== null);
  const handlers = scrubberHandlers({ dur, live, onSeek, onPreview: setPreview }, drag);
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Position"
      aria-valuemin={0}
      aria-valuemax={Math.round(dur)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${formatLength(Math.floor(shown))} of ${formatLength(dur)}`}
      {...handlers}
      className={classes.zone}
    >
      <div className={classes.track}>
        <div className="absolute inset-y-0 left-0 bg-red" style={{ width: percent }} />
        <span aria-hidden="true" className={classes.knob} style={{ left: percent }} />
      </div>
    </div>
  );
}

/** The scrubber's classes: the line 4px (8px on hover, focus or while dragging), the knob. */
export function frameScrubberClasses(dragging: boolean): {
  zone: string;
  track: string;
  knob: string;
} {
  return {
    zone: 'group absolute inset-x-0 bottom-0 z-[2] flex h-[18px] cursor-pointer touch-none items-end focus-ring-none',
    track: cx(
      'relative w-full bg-player-frame-track motion-scrub',
      dragging ? 'h-2' : 'h-1 group-hover:h-2 group-focus-visible:h-2',
    ),
    knob: cx(
      'pointer-events-none absolute top-1/2 size-3 -translate-1/2 rounded-full bg-white',
      dragging ? 'block' : 'hidden group-hover:block group-focus-visible:block',
    ),
  };
}
