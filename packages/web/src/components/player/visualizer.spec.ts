import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_PALETTE, glowPalette } from './palette';
import { runVisualizer } from './VisualizerCanvas';
import {
  BAR_COUNT,
  MAX_CANVAS_PIXELS,
  PAUSED_TIME_SCALE,
  backingRatio,
  barHeight,
  barLayout,
  binAmplitudes,
  createAmplitudeState,
  createFrameLoop,
  envelope,
  logBinRanges,
  syntheticAmplitudes,
} from './visualizer';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bar geometry', () => {
  it('lays out 56 bars with a gap of max(3px, w/220) filling the width', () => {
    const narrow = barLayout(375);
    expect(narrow.gap).toBe(3);
    expect(narrow.barWidth * BAR_COUNT + narrow.gap * (BAR_COUNT - 1)).toBeCloseTo(375);
    const wide = barLayout(1100);
    expect(wide.gap).toBe(5);
    expect(wide.barWidth * BAR_COUNT + wide.gap * (BAR_COUNT - 1)).toBeCloseTo(1100);
  });

  it('shapes the bars with env(i) = 1 − 0.7·((i − n/2)/(n/2))²', () => {
    expect(envelope(28)).toBe(1);
    expect(envelope(0)).toBeCloseTo(0.3);
    expect(envelope(14)).toBeCloseTo(1 - 0.7 * 0.25);
    expect(envelope(20)).toBeGreaterThan(envelope(10));
  });

  it('caps the backing store at MAX_CANVAS_PIXELS, so fullscreen costs no more than the panel', () => {
    expect(backingRatio(900, 560, 2)).toBe(2);
    const ratio = backingRatio(2560, 1440, 2);
    expect(ratio).toBeLessThan(2);
    expect(ratio * 2560 * ratio * 1440).toBeCloseTo(MAX_CANVAS_PIXELS);
    expect(backingRatio(0, 0, 2)).toBe(2);
  });

  it('never draws a bar shorter than its width', () => {
    expect(barHeight(500, 0, 1, 1, 12)).toBe(12);
    expect(barHeight(500, 1, 1, 1, 12)).toBeCloseTo(360);
    expect(barHeight(500, 0.5, 0.5, 1.1, 12)).toBeCloseTo(0.72 * 500 * 0.25 * 1.1);
  });
});

const width = ([start, end]: [number, number]) => end - start;

describe('logBinRanges', () => {
  const ranges = logBinRanges(1024, 48_000);

  it('gives every bar at least one bin, in order, without overlap', () => {
    expect(ranges).toHaveLength(BAR_COUNT);
    expect(ranges[0]![0]).toBe(1);
    for (const [start, end] of ranges) expect(end).toBeGreaterThan(start);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]![0]).toBe(ranges[index - 1]![1]);
    }
    // 16 kHz at 23.4 Hz a bin.
    expect(ranges.at(-1)![1]).toBe(683);
  });

  it('spaces the bars logarithmically: few bins low, many high', () => {
    expect(width(ranges[5]!)).toBeLessThanOrEqual(2);
    expect(width(ranges.at(-1)!)).toBeGreaterThan(40);
    expect(width(ranges[45]!)).toBeGreaterThan(width(ranges[30]!));
  });

  it('maps the bins of a bar to its amplitude', () => {
    const bytes = new Uint8Array(1024);
    const [start, end] = ranges[40]!;
    bytes.fill(255, start, end);
    const amps = binAmplitudes(bytes, ranges, new Float32Array(BAR_COUNT));
    expect(amps[40]).toBeGreaterThan(0.9);
    expect(amps[39]).toBe(0);
    expect(amps[41]).toBe(0);
  });
});

describe('amplitudes', () => {
  it('keeps drifting with non-zero synthetic amplitudes while paused, at 1/6 speed', () => {
    const state = createAmplitudeState();
    const frames: number[][] = [];
    for (let frame = 0; frame < 120; frame += 1) {
      const { amps, beat } = state.step(1 / 60, { analyser: null, playing: false });
      expect(beat).toBeGreaterThan(0);
      if (frame % 30 === 29) frames.push([...amps]);
    }
    for (const amps of frames) {
      expect(Math.min(...amps)).toBeGreaterThan(0);
    }
    // It moves, slowly.
    const moved = frames[3]!.reduce(
      (sum, amp, index) => sum + Math.abs(amp - frames[2]![index]!),
      0,
    );
    expect(moved).toBeGreaterThan(0);
    const t = 2 * PAUSED_TIME_SCALE;
    expect(frames[3]![10]).toBeCloseTo(syntheticAmplitudes(t, new Float32Array(56))[10]!, 1);
  });

  it('follows the analyser while playing and decays when it goes quiet', () => {
    const state = createAmplitudeState();
    let level = 255;
    const analyser = {
      read: (out: Uint8Array) => out.fill(level),
      binCount: 1024,
      sampleRate: 48_000,
    };
    for (let frame = 0; frame < 20; frame += 1) state.step(1 / 60, { analyser, playing: true });
    const loud = state.amps[28]!;
    expect(loud).toBeGreaterThan(0.9);
    level = 0;
    const { amps } = state.step(1 / 60, { analyser, playing: true });
    expect(amps[28]).toBeCloseTo(loud * 0.8);
  });
});

/** A controllable `requestAnimationFrame`. */
function fakeRaf() {
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    raf: vi.fn<(callback: FrameRequestCallback) => number>((callback: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    }),
    caf: vi.fn<(handle: number) => void>((handle: number) => {
      pending.delete(handle);
    }),
    flush(now: number) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(now);
    },
    get pending() {
      return pending.size;
    },
  };
}

describe('frame loop', () => {
  it('runs one frame per animation frame and none after stop', () => {
    const clock = fakeRaf();
    const frame = vi.fn<(dt: number) => void>();
    const loop = createFrameLoop(frame, clock.raf, clock.caf);
    loop.start();
    loop.start();
    expect(clock.pending).toBe(1);
    clock.flush(0);
    clock.flush(16);
    expect(frame).toHaveBeenCalledTimes(2);
    expect(frame).toHaveBeenLastCalledWith(0.016);
    loop.stop();
    expect(loop.running).toBe(false);
    clock.flush(32);
    expect(frame).toHaveBeenCalledTimes(2);
  });

  it('stops drawing when the panel unmounts and while the page is hidden', () => {
    const clock = fakeRaf();
    vi.stubGlobal('requestAnimationFrame', clock.raf);
    vi.stubGlobal('cancelAnimationFrame', clock.caf);
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const listeners = new Map<string, () => void>();
    const doc = {
      hidden: false,
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    vi.stubGlobal('document', doc);

    const canvas = {
      width: 0,
      height: 0,
      dataset: {} as Record<string, string>,
      getBoundingClientRect: () => ({ width: 400, height: 250 }),
    } as unknown as HTMLCanvasElement;
    const gradient = { addColorStop: () => undefined };
    const drawn = { bars: 0 };
    // The context's settable state, and the composite mode of every bar outline drawn.
    const props: Record<string | symbol, unknown> = { globalCompositeOperation: 'source-over' };
    const barModes = new Set<unknown>();
    const fillModes: unknown[] = [];
    const context = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key in props) return props[key];
          if (key === 'createLinearGradient' || key === 'createRadialGradient') {
            return () => gradient;
          }
          if (key === 'roundRect') {
            return () => {
              drawn.bars += 1;
              barModes.add(props.globalCompositeOperation);
            };
          }
          if (key === 'fillRect' || key === 'fill') {
            return () => fillModes.push(props.globalCompositeOperation);
          }
          return () => undefined;
        },
        set: (_target, key, value) => {
          props[key] = value;
          return true;
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    // Bloom, core and highlight: three outlines per bar and frame.
    const PER_FRAME = 3 * BAR_COUNT;

    const cleanup = runVisualizer(canvas, context, {
      palette: () => FALLBACK_PALETTE,
      input: () => ({ analyser: null, playing: false }),
    });
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(500);
    clock.flush(0);
    expect(drawn.bars).toBe(PER_FRAME);
    // The bars are drawn additively; the vignette under them is not.
    expect([...barModes]).toEqual(['lighter']);
    expect(fillModes[0]).toBe('source-over');
    expect(fillModes.slice(1).every((mode) => mode === 'lighter')).toBe(true);
    const lit = glowPalette(FALLBACK_PALETTE);
    expect(canvas.dataset).toEqual({
      c1: lit.c1,
      c2: lit.c2,
      rawC1: '#EA333E',
      rawC2: '#3A0CA3',
    });

    doc.hidden = true;
    listeners.get('visibilitychange')!();
    expect(clock.pending).toBe(0);
    doc.hidden = false;
    listeners.get('visibilitychange')!();
    clock.flush(16);
    expect(drawn.bars).toBe(2 * PER_FRAME);

    cleanup();
    expect(clock.pending).toBe(0);
    expect(listeners.size).toBe(0);
    clock.flush(32);
    expect(drawn.bars).toBe(2 * PER_FRAME);
    // Start, the frame after it, the restart when visible, the frame after that: none since.
    expect(clock.raf).toHaveBeenCalledTimes(4);
  });
});
