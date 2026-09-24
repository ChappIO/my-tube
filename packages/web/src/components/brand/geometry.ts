/**
 * Geometry of the MyTube mark: a downward triangle resting on a bar (a play button turned
 * on its head, sitting on a shelf), inside a rounded tile.
 *
 * All values are in CSS pixels for a mark rendered at `size` × `size`. The sizes drawn in
 * the handoff's logo set (Brand Directions, Turn 4) are pixel-hinted there, so those are
 * used verbatim. Every other size scales the 96px reference.
 */
export interface MarkGeometry {
  /** Tile corner radius. */
  radius: number;
  /** Triangle base width and height. */
  triangleWidth: number;
  triangleHeight: number;
  /** Bar ("shelf") width, height and corner radius. */
  barWidth: number;
  barHeight: number;
  barRadius: number;
  /** Vertical gap between the triangle's tip and the bar. */
  gap: number;
}

type Hinted = [
  radius: number,
  tw: number,
  th: number,
  bw: number,
  bh: number,
  br: number,
  gap: number,
];

/** Tile sizes drawn in the handoff (Turn 4: sizes row, lockups, app tile). */
const TILE_HINTED: Record<number, Hinted> = {
  16: [4, 6, 4, 7, 1.5, 0, 1],
  24: [6, 9, 5.5, 10, 2, 1, 1],
  28: [7, 10, 6, 11, 2, 1, 2],
  32: [8, 12, 7, 13, 2, 1, 2],
  40: [9, 14, 9, 16, 3, 1, 2],
  48: [11, 18, 11, 19, 3, 2, 3],
  64: [15, 24, 15, 26, 4, 2, 4],
  88: [20, 32, 20, 35, 6, 3, 5],
  96: [22, 34, 22, 38, 6, 3, 5],
};

/** The glyph without a tile fills more of its box (Turn 4: "Glyph, red" at 96px). */
const GLYPH_REFERENCE: Hinted = [0, 52, 34, 58, 9, 4, 7];

function fromHinted([radius, tw, th, bw, bh, br, gap]: Hinted): MarkGeometry {
  return {
    radius,
    triangleWidth: tw,
    triangleHeight: th,
    barWidth: bw,
    barHeight: bh,
    barRadius: br,
    gap,
  };
}

function scaled(reference: Hinted, size: number): MarkGeometry {
  const k = size / 96;
  const [radius, tw, th, bw, bh, br, gap] = reference;
  return fromHinted([radius * k, tw * k, th * k, bw * k, bh * k, br * k, gap * k]);
}

export function tileGeometry(size: number): MarkGeometry {
  const hinted = TILE_HINTED[size];
  return hinted ? fromHinted(hinted) : scaled(TILE_HINTED[96]!, size);
}

export function glyphGeometry(size: number): MarkGeometry {
  return scaled(GLYPH_REFERENCE, size);
}

export interface GlyphShapes {
  /** SVG path for the triangle, pointing down. */
  triangle: string;
  /** Bar rectangle. */
  bar: { x: number; y: number; width: number; height: number; rx: number };
}

/** Lays the glyph out centered in a `size` × `size` box. */
export function glyphShapes(size: number, g: MarkGeometry): GlyphShapes {
  const blockHeight = g.triangleHeight + g.gap + g.barHeight;
  const top = (size - blockHeight) / 2;
  const cx = size / 2;
  const left = cx - g.triangleWidth / 2;
  const right = cx + g.triangleWidth / 2;
  const tip = top + g.triangleHeight;
  return {
    triangle: `M${round(left)} ${round(top)}H${round(right)}L${round(cx)} ${round(tip)}Z`,
    bar: {
      x: round(cx - g.barWidth / 2),
      y: round(tip + g.gap),
      width: round(g.barWidth),
      height: round(g.barHeight),
      rx: round(g.barRadius),
    },
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
