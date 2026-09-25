import { describe, expect, it } from 'vitest';
import {
  FALLBACK_PALETTE,
  createPaletteCache,
  extractPalette,
  glowPalette,
  hexToHsl,
  hslToRgb,
  relativeLuminance,
  rgbToHsl,
  toHex,
} from './palette';

type Rgba = [number, number, number, number?];

/** RGBA bytes with `count` pixels of each colour. */
function pixels(...runs: Array<[Rgba, number]>): Uint8ClampedArray {
  const bytes: number[] = [];
  for (const [[r, g, b, a = 255], count] of runs) {
    for (let n = 0; n < count; n += 1) bytes.push(r, g, b, a);
  }
  return new Uint8ClampedArray(bytes);
}

const lightness = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255).l;
};

describe('extractPalette', () => {
  it('picks the most saturated frequent colour as c1 and a darker other hue as c2', () => {
    const cover = pixels(
      [[120, 120, 120], 300], // grey, the most frequent: never a colour
      [[200, 60, 60], 150], // muted red
      [[20, 200, 230], 80], // saturated cyan: c1
      [[40, 20, 110], 46], // dark indigo: c2
    );
    const palette = extractPalette(cover);
    expect(palette.c1).toBe(toHex(20, 200, 230));
    expect(palette.c2).toBe(toHex(40, 20, 110));
    expect(lightness(palette.c2)).toBeLessThan(lightness(palette.c1));
  });

  it('ignores a saturated colour that covers too little of the cover', () => {
    const cover = pixels([[200, 60, 60], 560], [[255, 0, 255], 10]);
    expect(extractPalette(cover).c1).toBe(toHex(200, 60, 60));
  });

  it('darkens c1 when the cover has no second colour', () => {
    const palette = extractPalette(pixels([[230, 40, 40], 576]));
    expect(palette.c1).toBe(toHex(230, 40, 40));
    const c1 = rgbToHsl(230, 40, 40);
    expect(palette.c2).toBe(toHex(...hslToRgb(c1.h, c1.s, c1.l * 0.45)));
  });

  it('keeps the fallback for a grey, black or transparent cover', () => {
    expect(extractPalette(pixels([[128, 128, 128], 300], [[250, 250, 250], 276]))).toEqual(
      FALLBACK_PALETTE,
    );
    expect(extractPalette(pixels([[5, 5, 10], 576]))).toEqual(FALLBACK_PALETTE);
    expect(extractPalette(pixels([[230, 40, 40, 0], 576]))).toEqual(FALLBACK_PALETTE);
    expect(extractPalette(new Uint8ClampedArray())).toEqual(FALLBACK_PALETTE);
  });
});

describe('colour conversion', () => {
  it('round-trips through HSL', () => {
    const { h, s, l } = rgbToHsl(58, 12, 163);
    expect(hslToRgb(h, s, l)).toEqual([58, 12, 163]);
    expect(toHex(234, 51, 62)).toBe('#EA333E');
  });
});

describe('createPaletteCache', () => {
  it('extracts once per URL and falls back when the image fails', async () => {
    const calls: string[] = [];
    const cache = createPaletteCache((url) => {
      calls.push(url);
      return url.includes('broken')
        ? Promise.reject(new Error('404'))
        : Promise.resolve(pixels([[20, 200, 230], 576]));
    });
    const first = await cache.get('/api/artwork/album/1');
    const again = await cache.get('/api/artwork/album/1');
    expect(first).toBe(again);
    expect(first.c1).toBe(toHex(20, 200, 230));
    expect(cache.peek('/api/artwork/album/1')).toBe(first);
    expect(await cache.get('/api/artwork/album/broken')).toEqual(FALLBACK_PALETTE);
    expect(await cache.get(null)).toEqual(FALLBACK_PALETTE);
    expect(calls).toEqual(['/api/artwork/album/1', '/api/artwork/album/broken']);
  });
});

const luminance = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return relativeLuminance((value >> 16) & 255, (value >> 8) & 255, value & 255);
};

describe('glowPalette', () => {
  it('turns a dark cover pair into luminous light of the same hue', () => {
    const raw = { c1: '#4D1615', c2: '#230A09' };
    const lit = glowPalette(raw);
    const c1 = hexToHsl(lit.c1);
    expect(Math.abs(c1.h - hexToHsl(raw.c1).h)).toBeLessThan(3);
    expect(c1.l).toBeGreaterThanOrEqual(0.6);
    expect(c1.s).toBeGreaterThanOrEqual(0.69);
    expect(luminance(lit.c1)).toBeGreaterThanOrEqual(0.22);
    expect(luminance(lit.c1)).toBeGreaterThan(luminance(raw.c1) * 5);
  });

  it('lifts a dark blue further until it reads bright', () => {
    const lit = glowPalette({ c1: '#1917BB', c2: '#0B0A54' });
    expect(Math.abs(hexToHsl(lit.c1).h - hexToHsl('#1917BB').h)).toBeLessThan(3);
    expect(hexToHsl(lit.c1).l).toBeGreaterThan(0.65);
    expect(luminance(lit.c1)).toBeGreaterThanOrEqual(0.22);
  });

  it('makes c2 a near-white tint of the second hue (of c1 when the second is grey)', () => {
    const lit = glowPalette({ c1: '#1917BB', c2: '#3A0CA3' });
    expect(hexToHsl(lit.c2).l).toBeCloseTo(0.88, 1);
    expect(Math.abs(hexToHsl(lit.c2).h - hexToHsl('#3A0CA3').h)).toBeLessThan(3);
    expect(luminance(lit.c2)).toBeGreaterThan(luminance(lit.c1));
    const grey = glowPalette({ c1: '#E82020', c2: '#333333' });
    expect(hexToHsl(grey.c2).h).toBeLessThan(3);
  });
});
