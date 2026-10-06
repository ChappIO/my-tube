import { describe, expect, it, vi } from 'vitest';
import { adjustCover, blurCover, blurPixels, createBlurredCoverCache } from './cover-blur';

const square = (size: number, fill: [number, number, number, number]) => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(fill, index);
  return pixels;
};

describe('adjustCover', () => {
  it('darkens every channel by the brightness and keeps alpha', () => {
    const pixels = adjustCover(square(1, [200, 100, 50, 255]), 1, 0.5);
    expect([...pixels]).toEqual([100, 50, 25, 255]);
  });

  it('saturates: a grey stays grey, a colour moves away from its luma', () => {
    expect([...adjustCover(square(1, [120, 120, 120, 255]), 1.2, 1)]).toEqual([120, 120, 120, 255]);
    const [r, g, b] = adjustCover(square(1, [200, 100, 100, 255]), 1.2, 1);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(100);
  });
});

describe('blurPixels', () => {
  it('spreads one bright pixel over its neighbours and conserves the light', () => {
    const size = 16;
    const pixels = square(size, [0, 0, 0, 255]);
    const centre = (8 * size + 8) * 4;
    pixels[centre] = 255;
    blurPixels(pixels, size, 2, 1);
    expect(pixels[centre]).toBeLessThan(255);
    expect(pixels[centre]).toBeGreaterThan(0);
    expect(pixels[centre + 4]).toBe(pixels[centre]);
    expect(pixels[centre + size * 4]).toBe(pixels[centre]);
    expect(pixels[centre + 3 * 4]).toBe(0);
    let total = 0;
    for (let index = 0; index < pixels.length; index += 4) total += pixels[index]!;
    expect(total).toBeGreaterThan(200);
    expect(pixels[centre + 3]).toBe(255);
  });

  it('clamps the edges: a flat colour stays flat to the border', () => {
    const pixels = blurPixels(square(12, [90, 60, 30, 255]), 12);
    for (let index = 0; index < pixels.length; index += 4) {
      expect(pixels[index]).toBe(90);
      expect(pixels[index + 3]).toBe(255);
    }
  });
});

describe('createBlurredCoverCache', () => {
  it('loads at the sample size, blurs once per URL, and gives null without art or on failure', async () => {
    const load = vi.fn<(url: string, size: number) => Promise<Uint8ClampedArray>>((_url, size) =>
      Promise.resolve(square(size, [200, 100, 50, 255])),
    );
    const cache = createBlurredCoverCache(load, 8);
    const first = await cache.get('a');
    expect(load).toHaveBeenCalledWith('a', 8);
    expect(first).toEqual(blurCover(square(8, [200, 100, 50, 255]), 8));
    expect(await cache.get('a')).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.get(null)).toBeNull();
    const failing = createBlurredCoverCache(() => Promise.reject(new Error('404')), 8);
    expect(await failing.get('b')).toBeNull();
  });
});
