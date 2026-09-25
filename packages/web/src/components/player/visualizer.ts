import type { Palette } from './palette';

/*
 * The Now Playing visualizer (frontend skill "Player", "Visualizer"): 56 rounded bars, centred
 * and growing up and down, in the cover's two colours over a radial vignette. Everything here is
 * independent of React: the bar maths, the analyser → amplitude mapping, the synthetic drift used
 * while paused (or without an analyser), the frame loop and the drawing. `VisualizerCanvas` wires
 * it to a canvas, the player store and `useAnalyser`.
 */

export const BAR_COUNT = 56;
/** Bars reach at most this share of the panel height (before `beat`). */
export const BAR_HEIGHT_SHARE = 0.72;
/** A falling bar keeps this share of its height per frame (≈ 0.8 decay). */
export const DECAY = 0.8;
/** A rising bar closes this share of the gap per frame. */
export const RISE = 0.5;
/** Paused, the synthetic drift runs at this share of real time. */
export const PAUSED_TIME_SCALE = 1 / 6;
/** The analyser's frequency span mapped onto the bars. */
export const MIN_HZ = 30;
export const MAX_HZ = 16_000;
/** The low band that drives `beat`. */
export const BEAT_MAX_HZ = 150;

/** The gap between bars: `max(3px, w/220)`. */
export function barGap(width: number): number {
  return Math.max(3, width / 220);
}

/** Bar width and gap for a panel `width` wide: the bars fill what the gaps leave. */
export function barLayout(width: number, count = BAR_COUNT): { gap: number; barWidth: number } {
  const gap = barGap(width);
  return { gap, barWidth: Math.max(1, (width - gap * (count - 1)) / count) };
}

/** `env(i) = 1 − 0.7·((i − n/2)/(n/2))²`: the bars are taller in the middle. */
export function envelope(index: number, count = BAR_COUNT): number {
  const half = count / 2;
  const offset = (index - half) / half;
  return 1 - 0.7 * offset * offset;
}

/** `max(barWidth, 0.72·h · amp · env · beat)`: never shorter than a round dot. */
export function barHeight(
  height: number,
  amp: number,
  env: number,
  beat: number,
  barWidth: number,
): number {
  return Math.max(barWidth, BAR_HEIGHT_SHARE * height * amp * env * beat);
}

/** The bin index of a frequency. */
const binOf = (hz: number, binCount: number, sampleRate: number) =>
  Math.round((hz / (sampleRate / 2)) * binCount);

/**
 * Which analyser bins feed each bar: `[start, end)` ranges spaced logarithmically from `MIN_HZ`
 * to `MAX_HZ` (capped at the bins that exist), each at least one bin wide, in order and without
 * overlap. Low bars get a bin or two, high bars many.
 */
export function logBinRanges(
  binCount: number,
  sampleRate: number,
  count = BAR_COUNT,
): Array<[number, number]> {
  const low = Math.max(1, binOf(MIN_HZ, binCount, sampleRate));
  const high = Math.max(low + count, Math.min(binCount, binOf(MAX_HZ, binCount, sampleRate)));
  const ranges: Array<[number, number]> = [];
  let start = low;
  for (let index = 0; index < count; index += 1) {
    const edge = Math.round(low * Math.pow(high / low, (index + 1) / count));
    // Leave at least one bin for every bar still to come.
    const end = Math.min(Math.max(edge, start + 1), high - (count - index - 1));
    ranges.push([start, end]);
    start = end;
  }
  return ranges;
}

/**
 * Bar amplitudes (0–1) from `getByteFrequencyData` bytes: the mean of each bar's bins, weighted
 * from ×0.8 at the bass to ×1.8 at the treble (music carries less energy up there).
 */
export function binAmplitudes(
  bytes: ArrayLike<number>,
  ranges: ReadonlyArray<readonly [number, number]>,
  out: Float32Array,
): Float32Array {
  const count = ranges.length;
  for (let index = 0; index < count; index += 1) {
    const [start, end] = ranges[index]!;
    let sum = 0;
    for (let bin = start; bin < end; bin += 1) sum += bytes[bin] ?? 0;
    const mean = sum / Math.max(1, end - start) / 255;
    out[index] = Math.min(1, mean * (0.8 + index / count));
  }
  return out;
}

/** The low band's energy (0–1): the mean of the bins under `BEAT_MAX_HZ`. */
export function lowBandEnergy(
  bytes: ArrayLike<number>,
  binCount: number,
  sampleRate: number,
): number {
  const end = Math.max(2, binOf(BEAT_MAX_HZ, binCount, sampleRate));
  let sum = 0;
  for (let bin = 1; bin < end; bin += 1) sum += bytes[bin] ?? 0;
  return sum / (end - 1) / 255;
}

/**
 * Normalises the low-band energy against its own recent peak (which decays slowly) into `beat`,
 * 0.7–1.15: a kick drum swells the bars, a quiet passage settles them.
 */
export function createBeatTracker(): (energy: number) => number {
  let peak = 0.2;
  return (energy) => {
    peak = Math.max(energy, peak * 0.995, 0.2);
    const norm = energy / peak;
    return 0.7 + 0.45 * norm * norm;
  };
}

/** Synthetic amplitudes (0.08–0.82) at time `t` seconds: two slow waves across the bars. */
export function syntheticAmplitudes(t: number, out: Float32Array): Float32Array {
  for (let index = 0; index < out.length; index += 1) {
    out[index] =
      0.45 + 0.25 * Math.sin(t * 1.3 + index * 0.35) + 0.12 * Math.sin(t * 2.1 - index * 0.17);
  }
  return out;
}

/** The synthetic `beat` at time `t`. */
export function syntheticBeat(t: number): number {
  return 0.92 + 0.08 * Math.sin(t * 2.4);
}

/** Moves `current` towards `target` in place: rises quickly, falls with `DECAY`. */
export function smoothInto(current: Float32Array, target: Float32Array): Float32Array {
  for (let index = 0; index < current.length; index += 1) {
    const now = current[index]!;
    const goal = target[index]!;
    current[index] = goal > now ? now + (goal - now) * RISE : Math.max(goal, now * DECAY);
  }
  return current;
}

/** What drives one frame. */
export interface FrameInput {
  /** The analyser reader, or null (no `AudioContext`, not attached yet). */
  analyser: {
    read(out: Uint8Array<ArrayBuffer>): void;
    binCount: number;
    sampleRate: number;
  } | null;
  playing: boolean;
}

/**
 * The per-frame amplitude state: the analyser while playing, the synthetic drift otherwise (at
 * `PAUSED_TIME_SCALE` while paused). `step(dt, input)` advances it and returns the smoothed
 * amplitudes and `beat` the bars are drawn from.
 */
export function createAmplitudeState(count = BAR_COUNT) {
  const amps = new Float32Array(count);
  const target = new Float32Array(count);
  const track = createBeatTracker();
  let bytes = new Uint8Array(0);
  let ranges: Array<[number, number]> = [];
  let rangesFor = '';
  let t = 0;
  let beat = 1;
  return {
    amps,
    get beat() {
      return beat;
    },
    step(dt: number, { analyser, playing }: FrameInput) {
      const live = playing && analyser !== null;
      t += dt * (playing ? 1 : PAUSED_TIME_SCALE);
      let targetBeat: number;
      if (live) {
        const key = `${analyser.binCount}/${analyser.sampleRate}`;
        if (key !== rangesFor) {
          bytes = new Uint8Array(analyser.binCount);
          ranges = logBinRanges(analyser.binCount, analyser.sampleRate, count);
          rangesFor = key;
        }
        analyser.read(bytes);
        binAmplitudes(bytes, ranges, target);
        targetBeat = track(lowBandEnergy(bytes, analyser.binCount, analyser.sampleRate));
      } else {
        syntheticAmplitudes(t, target);
        targetBeat = syntheticBeat(t);
      }
      smoothInto(amps, target);
      beat += (targetBeat - beat) * 0.3;
      return { amps, beat };
    },
  };
}

export interface FrameLoop {
  start(): void;
  stop(): void;
  readonly running: boolean;
}

/**
 * One `requestAnimationFrame` loop calling `frame(dtSeconds)`; `stop` cancels the pending frame
 * so no callback runs after it. `dt` is capped so a long gap (a hidden tab) does not jump.
 */
export function createFrameLoop(
  frame: (dt: number) => void,
  raf: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
  caf: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): FrameLoop {
  let handle: number | null = null;
  let last: number | null = null;
  const tick = (now: number) => {
    handle = raf(tick);
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    frame(dt);
  };
  return {
    start() {
      if (handle !== null) return;
      last = null;
      handle = raf(tick);
    },
    stop() {
      if (handle === null) return;
      caf(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
  };
}

/** The bloom: a soft `c1` glow around the bars, rendered small and scaled up. */
export const BLOOM_BLUR = 36;
export const BLOOM_ALPHA = 1;
/** The glow is drawn at this share of the panel's CSS size (scaling up softens it for free). */
export const GLOW_SCALE = 1 / 6;
/** The core bar's opacity (additive over the glow). */
export const CORE_ALPHA = 0.7;
/** The white-hot line down the middle of each bar: its share of the bar width, and alpha. */
export const HIGHLIGHT_WIDTH = 0.24;
export const HIGHLIGHT_ALPHA = 0.45;

/** Adds one bar's rounded outline to the current path. */
function barPath(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (typeof context.roundRect === 'function') context.roundRect(x, y, w, h, w / 2);
  else context.rect(x, y, w, h);
}

/** A small offscreen surface for the glow. */
export interface GlowSurface {
  canvas: CanvasImageSource & { width: number; height: number };
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/** The default glow surface: an `OffscreenCanvas`, or none (the glow falls back to a shadow). */
export function offscreenGlowSurface(width: number, height: number): GlowSurface | null {
  if (typeof OffscreenCanvas !== 'function') return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  return context ? { canvas, context } : null;
}

export interface BarRenderer {
  /**
   * Paints one frame. `palette` is the lit palette (`glowPalette`); `ratio` the device pixel
   * ratio the context is scaled by.
   */
  draw(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    ratio: number,
    amps: Float32Array,
    beat: number,
    palette: Palette,
  ): void;
}

/**
 * The bar renderer. Each frame: clear, the radial vignette (centre 50% / 60%, radius
 * 0.7 × max(w,h)) under everything, then the bars as light, all additive
 * (`globalCompositeOperation = 'lighter'`) so they glow over the blurred cover:
 *
 * 1. bloom: only the `c1` glow of the bars (their shapes drawn off-surface, the shadow offset
 *    back on), rendered on a surface at `GLOW_SCALE` and scaled up, which keeps a wide blur cheap
 *    at HiDPI; without an offscreen surface, a `BLOOM_BLUR` shadow on the panel itself;
 * 2. core: each bar in the vertical gradient `c1` (bottom half) → `c2` (near-white top);
 * 3. highlight: a thin near-white line down the middle of every bar, one path.
 *
 * Gradients are cached: the vignette per canvas size, the bar gradient per palette as a unit
 * gradient (0 → −1) that each bar maps onto itself through the transform at fill time.
 */
export function createBarRenderer(
  makeSurface: (width: number, height: number) => GlowSurface | null = offscreenGlowSurface,
): BarRenderer {
  let vignette: CanvasGradient | null = null;
  let vignetteFor = '';
  let barFill: CanvasGradient | null = null;
  let barFillFor = '';
  let tops = new Float32Array(0);
  let heights = new Float32Array(0);
  let glow: GlowSurface | null = null;
  let glowFor = '';
  return {
    draw(context, width, height, ratio, amps, beat, palette) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, width, height);

      const sizeKey = `${width}x${height}`;
      if (!vignette || sizeKey !== vignetteFor) {
        const cx = width * 0.5;
        const cy = height * 0.6;
        vignette = context.createRadialGradient(cx, cy, 0, cx, cy, 0.7 * Math.max(width, height));
        vignette.addColorStop(0, 'rgba(15,16,18,0.1)');
        vignette.addColorStop(1, 'rgba(15,16,18,0.55)');
        vignetteFor = sizeKey;
      }
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      const barKey = `${palette.c1}/${palette.c2}`;
      if (!barFill || barKey !== barFillFor) {
        barFill = context.createLinearGradient(0, 0, 0, -1);
        barFill.addColorStop(0, palette.c1);
        barFill.addColorStop(0.5, palette.c1);
        barFill.addColorStop(1, palette.c2);
        barFillFor = barKey;
      }

      const count = amps.length;
      const { gap, barWidth } = barLayout(width, count);
      const mid = height / 2;
      if (heights.length !== count) {
        tops = new Float32Array(count);
        heights = new Float32Array(count);
      }
      for (let index = 0; index < count; index += 1) {
        const h = barHeight(height, amps[index]!, envelope(index, count), beat, barWidth);
        heights[index] = h;
        tops[index] = mid - h / 2;
      }
      const xOf = (index: number) => index * (barWidth + gap);

      // 1. Bloom. The shapes sit one surface width to the left; their shadows land on the bars.
      if (sizeKey !== glowFor) {
        glow = makeSurface(Math.ceil(width * GLOW_SCALE), Math.ceil(height * GLOW_SCALE));
        glowFor = sizeKey;
      }
      const away = width + 100;
      if (glow) {
        const g = glow.context;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, glow.canvas.width, glow.canvas.height);
        g.setTransform(GLOW_SCALE, 0, 0, GLOW_SCALE, 0, 0);
        g.fillStyle = palette.c1;
        g.shadowColor = palette.c1;
        g.shadowBlur = BLOOM_BLUR * GLOW_SCALE;
        g.shadowOffsetX = away * GLOW_SCALE;
        g.beginPath();
        for (let index = 0; index < count; index += 1) {
          barPath(g, xOf(index) - away, tops[index]!, barWidth, heights[index]!);
        }
        g.fill();
      }

      context.save();
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = BLOOM_ALPHA;
      if (glow) {
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(
          glow.canvas,
          0,
          0,
          glow.canvas.width / GLOW_SCALE,
          glow.canvas.height / GLOW_SCALE,
        );
      } else {
        context.fillStyle = palette.c1;
        context.shadowColor = palette.c1;
        context.shadowBlur = BLOOM_BLUR * ratio;
        context.shadowOffsetX = away * ratio;
        context.beginPath();
        for (let index = 0; index < count; index += 1) {
          barPath(context, xOf(index) - away, tops[index]!, barWidth, heights[index]!);
        }
        context.fill();
        context.shadowOffsetX = 0;
        context.shadowBlur = 0;
      }

      // 2. Core: the path in CSS pixels, the unit gradient stretched over the bar at fill time.
      context.globalAlpha = CORE_ALPHA;
      context.fillStyle = barFill;
      for (let index = 0; index < count; index += 1) {
        const x = xOf(index);
        const top = tops[index]!;
        const h = heights[index]!;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.beginPath();
        barPath(context, x, top, barWidth, h);
        context.setTransform(ratio, 0, 0, ratio * h, ratio * x, ratio * (top + h));
        context.fill();
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // 3. Highlight.
      const line = Math.max(1, barWidth * HIGHLIGHT_WIDTH);
      const inset = (barWidth - line) / 2;
      context.globalAlpha = HIGHLIGHT_ALPHA;
      context.fillStyle = palette.c2;
      context.beginPath();
      for (let index = 0; index < count; index += 1) {
        const h = heights[index]!;
        const length = Math.max(line, h - barWidth);
        barPath(context, xOf(index) + inset, tops[index]! + (h - length) / 2, line, length);
      }
      context.fill();
      context.restore();
    },
  };
}
