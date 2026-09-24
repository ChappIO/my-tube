/**
 * Placeholder artwork: a deterministic two-tone gradient hashed from a seed string, ported from
 * the design prototype ("Artwork colors (prototype only)"). It stands in for real covers and
 * thumbnails in demos and when an item has no art yet.
 *
 * The palette below is picture content, like the pixels of a real cover, not UI color. UI code
 * never uses these values; it uses the tokens in styles.css.
 */
export const PLACEHOLDER_PALETTE: readonly (readonly [string, string])[] = [
  ['#e63946', '#8b1e3f'],
  ['#f4a261', '#c1121f'],
  ['#2a9d8f', '#264653'],
  ['#ffb703', '#fb8500'],
  ['#8338ec', '#3a0ca3'],
  ['#06d6a0', '#118ab2'],
  ['#ff006e', '#8338ec'],
  ['#1d3557', '#457b9d'],
  ['#f77f00', '#d62828'],
  ['#3a86ff', '#0b132b'],
  ['#e9c46a', '#e76f51'],
  ['#7209b7', '#f72585'],
  ['#0ead69', '#1b4332'],
  ['#ffd166', '#ef476f'],
  ['#00b4d8', '#03045e'],
  ['#bc6c25', '#283618'],
];

/** The prototype's string hash: `x = x * 31 + code`, kept as an unsigned 32-bit integer. */
export function hashSeed(seed: string): number {
  let x = 0;
  for (const ch of seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x;
}

/**
 * CSS background for a placeholder cover. The same seed always gives the same gradient.
 * `offset` picks a later palette entry with the same angle; the playlist stack uses offsets
 * 0, 3, 7 and 11 so its four covers differ, as in the prototype.
 */
export function placeholderFill(seed: string, offset = 0): string {
  const [from, to] = PLACEHOLDER_PALETTE[(hashSeed(seed) + offset) % PLACEHOLDER_PALETTE.length]!;
  const angle = 100 + (hashSeed(`${seed}a`) % 160);
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}
