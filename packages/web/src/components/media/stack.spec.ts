import { describe, expect, it } from 'vitest';
import { placeholderFill } from './placeholder';
import { stackCovers, stackLayerStyle, stackOverlayOpacity } from './stack';

describe('stackCovers', () => {
  it('uses the first four of four or more covers', () => {
    expect(stackCovers(['a', 'b', 'c', 'd', 'e']).map((c) => c.src)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('repeats two or three covers up to four', () => {
    expect(stackCovers(['a', 'b']).map((c) => c.src)).toEqual(['a', 'b', 'a', 'b']);
    expect(stackCovers(['a', 'b', 'c']).map((c) => c.src)).toEqual(['a', 'b', 'c', 'a']);
  });

  it('falls back to a single cover for one', () => {
    expect(stackCovers(['a'])).toEqual([{ src: 'a', background: undefined }]);
  });

  it('draws four placeholders from a seed when there are no covers', () => {
    expect(stackCovers([], 'Late night')).toEqual([
      { background: placeholderFill('Late night', 0) },
      { background: placeholderFill('Late night', 3) },
      { background: placeholderFill('Late night', 7) },
      { background: placeholderFill('Late night', 11) },
    ]);
  });

  it('draws nothing without covers or seed', () => {
    expect(stackCovers()).toEqual([]);
  });

  it('puts the seed placeholder behind image covers', () => {
    expect(stackCovers(['a', 'b'], 's')[3]).toEqual({
      src: 'b',
      background: placeholderFill('s', 11),
    });
  });
});

describe('stackLayerStyle', () => {
  it('follows the stack geometry', () => {
    expect(stackLayerStyle(0)).toMatchObject({
      left: '8%',
      zIndex: 4,
      transform: 'translateZ(0px) rotateY(-10deg)',
    });
    expect(stackLayerStyle(3)).toMatchObject({
      left: '68%',
      width: '62%',
      zIndex: 1,
      transform: 'translateZ(-270px) rotateY(-38deg)',
    });
  });

  it('fades the back covers', () => {
    expect([0, 1, 2, 3].map(stackOverlayOpacity)).toEqual([0, 0.24, 0.48, 0.72]);
  });
});
