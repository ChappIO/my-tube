import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  FrameScrubber,
  type ScrubEvent,
  frameScrubberClasses,
  scrubberHandlers,
} from './FrameScrubber';

/** A pointer event over a 400px track starting at x = 100. */
function pointer(clientX: number, captured = true) {
  const stopPropagation = vi.fn<() => void>();
  const setPointerCapture = vi.fn<(id: number) => void>();
  const event: ScrubEvent = {
    button: 0,
    clientX,
    pointerId: 7,
    stopPropagation,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 100, width: 400 }),
      setPointerCapture,
      hasPointerCapture: () => captured,
    },
  };
  return { event, stopPropagation, setPointerCapture };
}

function target(live: boolean) {
  return {
    dur: 200,
    live,
    onSeek: vi.fn<(pos: number) => void>(),
    onPreview: vi.fn<(pos: number | null) => void>(),
  };
}

describe('frame scrubber', () => {
  it('grows from 4px to 8px on hover and focus, and stays grown with the knob while dragging', () => {
    const idle = frameScrubberClasses(false);
    expect(idle.zone).toContain('h-[18px]');
    expect(idle.track).toContain('h-1');
    expect(idle.track).toContain('group-hover:h-2');
    expect(idle.track).toContain('motion-scrub');
    expect(idle.knob).toContain('hidden');
    expect(idle.knob).toContain('group-hover:block');
    expect(idle.knob).toContain('size-3');
    const dragging = frameScrubberClasses(true);
    expect(dragging.track).toContain('h-2');
    expect(dragging.track).not.toContain('h-1');
    expect(dragging.knob).toContain('block');
    expect(dragging.knob).not.toContain('hidden');
  });

  it('renders a focusable slider with the fill at the position', () => {
    const html = renderToStaticMarkup(
      <FrameScrubber pos={50} dur={200} live onSeek={() => undefined} />,
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-valuetext="0:50 of 3:20"');
    expect(html).toContain('width:25%');
  });

  it('a click seeks once at the fraction clicked', () => {
    const remux = target(false);
    const handlers = scrubberHandlers(remux, { current: null });
    const down = pointer(200);
    handlers.onPointerDown(down.event);
    handlers.onPointerUp(pointer(200).event);
    // 100px into a 400px track of 200 s.
    expect(remux.onSeek.mock.calls).toEqual([[50]]);
    expect(down.setPointerCapture).toHaveBeenCalledWith(7);
    expect(remux.onPreview.mock.calls).toEqual([[50], [null]]);
  });

  it('a remux seeks once, on release, while the position follows the drag', () => {
    const remux = target(false);
    const drag = { current: null };
    const handlers = scrubberHandlers(remux, drag);
    handlers.onPointerDown(pointer(150).event);
    handlers.onPointerMove(pointer(250).event);
    handlers.onPointerMove(pointer(400).event);
    expect(remux.onSeek).not.toHaveBeenCalled();
    expect(remux.onPreview.mock.calls.map(([pos]) => pos)).toEqual([25, 75, 150]);
    handlers.onPointerUp(pointer(420).event);
    expect(remux.onSeek.mock.calls).toEqual([[160]]);
    expect(drag.current).toBeNull();
  });

  it('a direct file seeks live while dragging, without a repeat on release', () => {
    const direct = target(true);
    const handlers = scrubberHandlers(direct, { current: null });
    handlers.onPointerDown(pointer(150).event);
    handlers.onPointerMove(pointer(250).event);
    handlers.onPointerMove(pointer(250).event);
    handlers.onPointerUp(pointer(250).event);
    expect(direct.onSeek.mock.calls).toEqual([[25], [75]]);
  });

  it('moves without a captured pointer do nothing (hovering is not scrubbing)', () => {
    const direct = target(true);
    const handlers = scrubberHandlers(direct, { current: null });
    handlers.onPointerMove(pointer(250, false).event);
    expect(direct.onSeek).not.toHaveBeenCalled();
    expect(direct.onPreview).not.toHaveBeenCalled();
  });

  it('stops clicks and presses from reaching the frame (which toggles play)', () => {
    const handlers = scrubberHandlers(target(false), { current: null });
    const down = pointer(200);
    const up = pointer(200);
    const click = { stopPropagation: vi.fn<() => void>() };
    handlers.onPointerDown(down.event);
    handlers.onPointerUp(up.event);
    handlers.onClick(click);
    expect(down.stopPropagation).toHaveBeenCalled();
    expect(up.stopPropagation).toHaveBeenCalled();
    expect(click.stopPropagation).toHaveBeenCalled();
  });

  it('does nothing before the length is known', () => {
    const unknown = { ...target(true), dur: 0 };
    const handlers = scrubberHandlers(unknown, { current: null });
    handlers.onPointerDown(pointer(200).event);
    expect(unknown.onSeek).not.toHaveBeenCalled();
    expect(unknown.onPreview).not.toHaveBeenCalled();
  });
});
