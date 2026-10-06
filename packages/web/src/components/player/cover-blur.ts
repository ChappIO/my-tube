/*
 * The Now Playing panel's background: the cover blurred, darkened and slightly saturated
 * (frontend skill "Player", "Now Playing, music"). It used to be a CSS `filter` on the cover
 * image, which the compositor re-applied on every frame the visualizer drew, at screen
 * resolution: a 40px gaussian blur over a whole HiDPI fullscreen, sixty times a second. Now the
 * look is baked once into a `BLURRED_COVER_SIZE` square of pixels that the browser only scales
 * up. `blurCover` is pure; `createBlurredCoverCache` caches one per art URL around a pixel
 * loader.
 */

/** The cover is sampled and blurred at this many pixels square. */
export const BLURRED_COVER_SIZE = 128;
/** `brightness(.45)`. */
export const COVER_BRIGHTNESS = 0.45;
/** `saturate(1.2)`. */
export const COVER_SATURATION = 1.2;
/**
 * The blur: three box passes of this radius, ≈ a gaussian of σ 6 at `BLURRED_COVER_SIZE`, which
 * is the old `blur(40px)` on a 900px panel.
 */
export const COVER_BLUR_RADIUS = 5;
export const COVER_BLUR_PASSES = 3;

/**
 * CSS `saturate(s)` then `brightness(b)` on RGBA bytes in place (the alpha stays): the filter
 * module's saturation matrix (Rec. 709 luma weights), then every channel scaled.
 */
export function adjustCover(
  pixels: Uint8ClampedArray,
  saturation = COVER_SATURATION,
  brightness = COVER_BRIGHTNESS,
): Uint8ClampedArray {
  const s = saturation;
  const rr = 0.213 + 0.787 * s;
  const rg = 0.715 - 0.715 * s;
  const rb = 0.072 - 0.072 * s;
  const gr = 0.213 - 0.213 * s;
  const gg = 0.715 + 0.285 * s;
  const gb = 0.072 - 0.072 * s;
  const br = 0.213 - 0.213 * s;
  const bg = 0.715 - 0.715 * s;
  const bb = 0.072 + 0.928 * s;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const r = pixels[index]!;
    const g = pixels[index + 1]!;
    const b = pixels[index + 2]!;
    pixels[index] = (rr * r + rg * g + rb * b) * brightness;
    pixels[index + 1] = (gr * r + gg * g + gb * b) * brightness;
    pixels[index + 2] = (br * r + bg * g + bb * b) * brightness;
  }
  return pixels;
}

/** One horizontal box pass over every channel of a `size` square, edges clamped. */
function boxPass(from: Float32Array, to: Float32Array, size: number, radius: number) {
  const span = 2 * radius + 1;
  for (let y = 0; y < size; y += 1) {
    const row = y * size * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const at = (x: number) => from[row + Math.min(size - 1, Math.max(0, x)) * 4 + channel]!;
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) sum += at(x);
      for (let x = 0; x < size; x += 1) {
        to[row + x * 4 + channel] = sum / span;
        sum += at(x + radius + 1) - at(x - radius);
      }
    }
  }
}

/** Transposes a `size` square of RGBA values (so one horizontal pass serves both axes). */
function transpose(from: Float32Array, to: Float32Array, size: number) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const source = (y * size + x) * 4;
      const target = (x * size + y) * 4;
      to[target] = from[source]!;
      to[target + 1] = from[source + 1]!;
      to[target + 2] = from[source + 2]!;
      to[target + 3] = from[source + 3]!;
    }
  }
}

/**
 * Blurs RGBA bytes of a `size` square in place: `passes` separable box blurs of `radius`
 * (three approximate a gaussian), the edges clamped so nothing darkens at the border.
 */
export function blurPixels(
  pixels: Uint8ClampedArray,
  size: number,
  radius = COVER_BLUR_RADIUS,
  passes = COVER_BLUR_PASSES,
): Uint8ClampedArray {
  let a = Float32Array.from(pixels);
  let b = new Float32Array(a.length);
  for (let pass = 0; pass < passes; pass += 1) {
    boxPass(a, b, size, radius);
    transpose(b, a, size);
    boxPass(a, b, size, radius);
    transpose(b, a, size);
  }
  pixels.set(a);
  return pixels;
}

/** The background pixels of a cover: `adjustCover`, then `blurPixels`. In place. */
export function blurCover(pixels: Uint8ClampedArray, size = BLURRED_COVER_SIZE): Uint8ClampedArray {
  return blurPixels(adjustCover(pixels), size);
}

export interface BlurredCoverCache {
  /** The blurred pixels of this art URL, or null without one or when it fails; cached per URL. */
  get(url: string | null | undefined): Promise<Uint8ClampedArray | null>;
}

/** One blurred cover per art URL around a pixel loader (`loadCoverPixels` at the sample size). */
export function createBlurredCoverCache(
  load: (url: string, size: number) => Promise<Uint8ClampedArray>,
  size = BLURRED_COVER_SIZE,
): BlurredCoverCache {
  const pending = new Map<string, Promise<Uint8ClampedArray | null>>();
  return {
    get(url) {
      if (!url) return Promise.resolve(null);
      let blurred = pending.get(url);
      if (!blurred) {
        blurred = load(url, size)
          .then((pixels) => blurCover(pixels, size))
          .catch(() => null);
        pending.set(url, blurred);
      }
      return blurred;
    },
  };
}
