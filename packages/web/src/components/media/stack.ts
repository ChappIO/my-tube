import type { CSSProperties } from 'react';
import { placeholderFill } from './placeholder';

/** One cover in the playlist stack: an image, a placeholder gradient, or both (image on top). */
export interface StackCover {
  src?: string;
  background?: string;
}

/** Number of covers the stack shows. */
export const STACK_SIZE = 4;

/** Palette offsets for the four placeholder covers. */
export const STACK_PLACEHOLDER_OFFSETS = [0, 3, 7, 11] as const;

/**
 * Which covers the playlist stack draws.
 *
 * - Four or more covers: the first four.
 * - Two or three: repeated in order until there are four.
 * - One: that cover alone; the component falls back to a single flat cover.
 * - None: four placeholder gradients from `seed`, or nothing without a seed.
 *
 * With a seed, image covers also get a placeholder gradient behind them while they load.
 */
export function stackCovers(covers: readonly string[] = [], seed?: string): StackCover[] {
  const background = (i: number) =>
    seed === undefined ? undefined : placeholderFill(seed, STACK_PLACEHOLDER_OFFSETS[i]);

  if (covers.length === 0) {
    if (seed === undefined) return [];
    return STACK_PLACEHOLDER_OFFSETS.map((_, i) => ({ background: background(i) }));
  }
  if (covers.length === 1) return [{ src: covers[0], background: background(0) }];
  return Array.from({ length: STACK_SIZE }, (_, i) => ({
    src: covers[i % covers.length],
    background: background(i),
  }));
}

/**
 * Geometry of cover `i` (0 = front): 62% wide, inset 12%
 * top and bottom, 20% further right and 90px further back per step, the front cover turned
 * −10° and the rest −38° about their left edge.
 */
export function stackLayerStyle(i: number): CSSProperties {
  return {
    top: '12%',
    bottom: '12%',
    left: `${8 + i * 20}%`,
    width: '62%',
    zIndex: STACK_SIZE - i,
    transformOrigin: 'left center',
    transform: `translateZ(${-i * 90}px) rotateY(${i === 0 ? -10 : -38}deg)`,
  };
}

/** Opacity of the `surface` overlay that fades cover `i` into the background. */
export function stackOverlayOpacity(i: number): number {
  return [0, 0.24, 0.48, 0.72][i] ?? 0.72;
}

/** The shared 3D space the four covers sit in. */
export const STACK_SCENE_STYLE: CSSProperties = {
  perspective: '420px',
  perspectiveOrigin: '30% 50%',
  transformStyle: 'preserve-3d',
};
