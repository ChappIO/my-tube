import { describe, expect, it } from 'vitest';
import { glyphGeometry, glyphShapes, tileGeometry } from './geometry';

describe('tileGeometry', () => {
  it('uses the handoff values for the header tile', () => {
    expect(tileGeometry(28)).toEqual({
      radius: 7,
      triangleWidth: 10,
      triangleHeight: 6,
      barWidth: 11,
      barHeight: 2,
      barRadius: 1,
      gap: 2,
    });
  });

  it('keeps the spec proportions at unlisted sizes', () => {
    const g = tileGeometry(200);
    expect(g.radius / 200).toBeCloseTo(0.23, 2);
    expect(g.triangleWidth / 200).toBeCloseTo(0.36, 1);
    expect(g.triangleHeight / 200).toBeCloseTo(0.23, 2);
    expect(g.barWidth / 200).toBeCloseTo(0.4, 2);
    expect(g.barHeight / 200).toBeCloseTo(0.06, 2);
    expect(g.gap / 200).toBeCloseTo(0.05, 2);
  });
});

describe('glyphShapes', () => {
  it('centers the triangle and bar in the box', () => {
    const { triangle, bar } = glyphShapes(96, tileGeometry(96));
    // Block is 22 + 5 + 6 = 33 tall, so it starts at 31.5.
    expect(triangle).toBe('M31 31.5H65L48 53.5Z');
    expect(bar).toEqual({ x: 29, y: 58.5, width: 38, height: 6, rx: 3 });
  });

  it('draws a larger glyph when there is no tile', () => {
    expect(glyphGeometry(96).triangleWidth).toBeGreaterThan(tileGeometry(96).triangleWidth);
  });
});
