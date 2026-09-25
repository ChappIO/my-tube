import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_PALETTE, hashSeed, placeholderFill } from './placeholder';

describe('hashSeed', () => {
  it('hashes like x * 31 + code', () => {
    expect(hashSeed('')).toBe(0);
    expect(hashSeed('a')).toBe(97);
    expect(hashSeed('ab')).toBe(97 * 31 + 98);
  });

  it('stays an unsigned 32-bit integer for long seeds', () => {
    const x = hashSeed('Ep. 41: the archive problem, a very long title that overflows');
    expect(Number.isInteger(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(2 ** 32);
  });
});

describe('placeholderFill', () => {
  it('is deterministic', () => {
    expect(placeholderFill('In Rainbows')).toBe(placeholderFill('In Rainbows'));
    expect(placeholderFill('In Rainbows', 3)).toBe(placeholderFill('In Rainbows', 3));
  });

  it('renders a two-tone gradient from the palette with an angle in [100, 260)', () => {
    const fill = placeholderFill('Tapestry');
    const match = /^linear-gradient\((\d+)deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)$/.exec(fill);
    expect(match).not.toBeNull();
    const angle = Number(match![1]);
    expect(angle).toBeGreaterThanOrEqual(100);
    expect(angle).toBeLessThan(260);
    expect(PLACEHOLDER_PALETTE).toContainEqual([match![2], match![3]]);
  });

  it('reproduces the formula for a known seed', () => {
    const [from, to] = PLACEHOLDER_PALETTE[hashSeed('Blue') % 16]!;
    const angle = 100 + (hashSeed('Bluea') % 160);
    expect(placeholderFill('Blue')).toBe(`linear-gradient(${angle}deg, ${from}, ${to})`);
  });

  it('shifts the palette entry by the offset and keeps the angle', () => {
    const base = placeholderFill('Late night');
    const shifted = placeholderFill('Late night', 3);
    expect(shifted).not.toBe(base);
    expect(shifted.split('deg')[0]).toBe(base.split('deg')[0]);
    expect(placeholderFill('Late night', 16)).toBe(base);
  });

  it('spreads different seeds over the palette', () => {
    const seeds = ['In Rainbows', 'Blue Train', 'Tapestry', 'Discovery', 'Blue', 'Voodoo', 'Aja'];
    expect(new Set(seeds.map((s) => placeholderFill(s))).size).toBeGreaterThan(3);
  });
});
