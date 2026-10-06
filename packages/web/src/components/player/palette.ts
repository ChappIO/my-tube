/*
 * The visualizer's two colours, picked from the cover (frontend skill "Player", "Visualizer").
 * The cover is drawn into a small canvas (`PALETTE_SAMPLE_SIZE` square), its pixels quantized to
 * a few levels per channel, and the buckets ranked: `c1` is the most saturated colour that covers
 * a fair share of the cover, `c2` a darker second one (another hue when the cover has one, else
 * `c1` darkened). A grey cover, or one that fails to load, keeps the fallback pair.
 * `glowPalette` turns that pair into the light the bars are drawn in (bright `c1`, near-white
 * `c2`).
 *
 * The extraction is pure (`extractPalette` on RGBA bytes); `createPaletteCache` caches one
 * promise per art URL around a pixel loader, and `loadCoverPixels` is the browser loader.
 */

export interface Palette {
  /** The bars' base (bottom) colour and their glow, `#rrggbb`. */
  c1: string;
  /** The bars' top colour, `#rrggbb`: darker as extracted, a near-white tint once lit. */
  c2: string;
}

export const FALLBACK_PALETTE: Palette = { c1: '#EA333E', c2: '#3A0CA3' };

/** The cover is sampled at this many pixels square. */
export const PALETTE_SAMPLE_SIZE = 24;

/** Levels kept per channel when quantizing (8 → 512 buckets). */
const LEVELS = 8;
/** A bucket needs this share of the opaque pixels to count as a colour of the cover. */
const MIN_SHARE = 0.03;
/** Below this saturation a colour reads as grey. */
const MIN_SATURATION = 0.2;
/** Too dark or too light to carry a hue. */
const MIN_LIGHTNESS = 0.12;
const MAX_LIGHTNESS = 0.9;
/** `c2` must differ from `c1` by this much hue (degrees) to be "another" colour. */
const MIN_HUE_DISTANCE = 25;
/** `c2` when the cover has no second colour: `c1` at this share of its lightness. */
const DARKEN = 0.45;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

interface Swatch {
  r: number;
  g: number;
  b: number;
  share: number;
  h: number;
  s: number;
  l: number;
}

/** RGB 0–255 → HSL (h in degrees, s and l 0–1). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/** HSL (h in degrees, s and l 0–1) → RGB 0–255. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

const hexChannel = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

/** RGB 0–255 → `#RRGGBB`. */
export function toHex(r: number, g: number, b: number): string {
  return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`.toUpperCase();
}

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const colourful = (swatch: Swatch) =>
  swatch.share >= MIN_SHARE &&
  swatch.s >= MIN_SATURATION &&
  swatch.l >= MIN_LIGHTNESS &&
  swatch.l <= MAX_LIGHTNESS;

/** The quantized colours of RGBA bytes, most frequent first. Transparent pixels are skipped. */
export function swatches(pixels: ArrayLike<number>): Swatch[] {
  const buckets = new Map<number, Bucket>();
  let total = 0;
  const step = 256 / LEVELS;
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3]! < 128) continue;
    const r = pixels[index]!;
    const g = pixels[index + 1]!;
    const b = pixels[index + 2]!;
    const key =
      Math.floor(r / step) * LEVELS * LEVELS + Math.floor(g / step) * LEVELS + Math.floor(b / step);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    total += 1;
  }
  return [...buckets.values()]
    .map((bucket) => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      return { r, g, b, share: bucket.count / total, ...rgbToHsl(r, g, b) };
    })
    .toSorted((a, b) => b.share - a.share);
}

/**
 * The two visualizer colours of a cover's RGBA bytes (`ImageData.data`). `c1`: the most
 * saturated colour covering at least 3% of the cover (too dark, too light and grey buckets never
 * count). `c2`: the most frequent other colour that is darker and another hue; without one, `c1`
 * darkened. A cover without any colour keeps the fallback.
 */
export function extractPalette(pixels: ArrayLike<number>): Palette {
  const candidates = swatches(pixels).filter(colourful);
  if (candidates.length === 0) return FALLBACK_PALETTE;
  const first = candidates.reduce((best, swatch) =>
    swatch.s > best.s || (swatch.s === best.s && swatch.share > best.share) ? swatch : best,
  );
  const second = candidates.find(
    (swatch) =>
      swatch !== first && swatch.l < first.l && hueDistance(swatch.h, first.h) >= MIN_HUE_DISTANCE,
  );
  const c1 = toHex(first.r, first.g, first.b);
  const c2 = second
    ? toHex(second.r, second.g, second.b)
    : toHex(...hslToRgb(first.h, first.s, first.l * DARKEN));
  return { c1, c2 };
}

/** `#RRGGBB` → HSL. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255);
}

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance (0–1) of RGB 0–255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** How the bars' light is derived from the cover colours (`glowPalette`). */
export const GLOW = {
  /** `c1` lightness is clamped into this range… */
  minLightness: 0.6,
  maxLightness: 0.65,
  /** …then raised (up to `ceilingLightness`) until the colour is at least this luminous. */
  minLuminance: 0.22,
  ceilingLightness: 0.8,
  minSaturation: 0.7,
  /** `c2`: a near-white tint of the second hue. */
  tintLightness: 0.88,
  tintSaturation: 0.9,
  /** Below this the second colour is grey: the tint takes `c1`'s hue. */
  greySaturation: 0.15,
} as const;

/**
 * The colours the bars are lit in: the cover's hues as light. `c1` keeps its hue at 60–65%
 * lightness and at least 70% saturation, raised further when that hue still reads dark (blue,
 * violet); `c2` becomes a near-white tint (88% lightness) of the second hue, so each bar runs
 * from colour at the bottom to almost white at the top. Dark covers give luminous bars too.
 */
export function glowPalette(raw: Palette): Palette {
  const base = hexToHsl(raw.c1);
  const saturation = Math.max(base.s, GLOW.minSaturation);
  let lightness = Math.min(GLOW.maxLightness, Math.max(GLOW.minLightness, base.l));
  let rgb = hslToRgb(base.h, saturation, lightness);
  while (relativeLuminance(...rgb) < GLOW.minLuminance && lightness < GLOW.ceilingLightness) {
    lightness = Math.min(GLOW.ceilingLightness, lightness + 0.02);
    rgb = hslToRgb(base.h, saturation, lightness);
  }
  const second = hexToHsl(raw.c2);
  const tintHue = second.s >= GLOW.greySaturation ? second.h : base.h;
  return {
    c1: toHex(...rgb),
    c2: toHex(...hslToRgb(tintHue, GLOW.tintSaturation, GLOW.tintLightness)),
  };
}

/** Reads a cover's pixels (RGBA bytes); rejects when the image fails. */
export type PixelLoader = (url: string) => Promise<ArrayLike<number>>;

export interface PaletteCache {
  /** The palette of this art URL (the fallback without one, or when it fails), cached per URL. */
  get(url: string | null | undefined): Promise<Palette>;
  /** The palette already known for this URL, if any. */
  peek(url: string | null | undefined): Palette | undefined;
}

/** One palette promise per art URL around a pixel loader. A failed load resolves to the fallback. */
export function createPaletteCache(load: PixelLoader): PaletteCache {
  const pending = new Map<string, Promise<Palette>>();
  const done = new Map<string, Palette>();
  return {
    get(url) {
      if (!url) return Promise.resolve(FALLBACK_PALETTE);
      let palette = pending.get(url);
      if (!palette) {
        palette = load(url)
          .then(extractPalette)
          .catch(() => FALLBACK_PALETTE)
          .then((result) => {
            done.set(url, result);
            return result;
          });
        pending.set(url, palette);
      }
      return palette;
    },
    peek(url) {
      return url ? done.get(url) : undefined;
    },
  };
}

/**
 * The browser loader: the cover (same-origin `/api/artwork/...`, `crossOrigin` set anyway so a
 * remote one fails cleanly instead of tainting) drawn into a `size` square canvas
 * (`PALETTE_SAMPLE_SIZE` for the palette; the blurred background samples larger).
 */
export function loadCoverPixels(
  url: string,
  size = PALETTE_SAMPLE_SIZE,
): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('No 2D context');
        context.drawImage(image, 0, 0, size, size);
        resolve(context.getImageData(0, 0, size, size).data);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    image.addEventListener('error', () => reject(new Error(`Cover did not load: ${url}`)));
    image.src = url;
  });
}
