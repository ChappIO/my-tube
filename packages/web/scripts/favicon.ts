/**
 * Writes public/favicon.svg and public/favicon.ico from the 16px tile geometry in
 * src/components/brand/geometry.ts, so the favicons can never drift from the mark.
 *
 *   node scripts/favicon.ts   (from packages/web; Node strips the types)
 *
 * The ICO holds 16px and 32px PNGs (32px is the 16px design at 2×, for high-density
 * screens). Rasterized here with 8×8 supersampling; no image dependencies.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { glyphShapes, tileGeometry } from '../src/components/brand/geometry.ts';

const RED: Rgb = [0xea, 0x33, 0x3e];
const WHITE: Rgb = [0xff, 0xff, 0xff];
const SIZE = 16;

type Rgb = [number, number, number];

const g = tileGeometry(SIZE);
const { bar } = glyphShapes(SIZE, g);
// Triangle corners from the same layout: top edge at `top`, tip on the center line.
const triTop = bar.y - g.gap - g.triangleHeight;
const triLeft = SIZE / 2 - g.triangleWidth / 2;
const triRight = SIZE / 2 + g.triangleWidth / 2;
const tipY = triTop + g.triangleHeight;

function svg(): string {
  const { triangle } = glyphShapes(SIZE, g);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" rx="${g.radius}" fill="#EA333E"/>` +
    `<path d="${triangle}" fill="#FFFFFF"/>` +
    `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}"${bar.rx ? ` rx="${bar.rx}"` : ''} fill="#FFFFFF"/>` +
    `</svg>\n`
  );
}

/** Point in the 16-unit design space: inside the rounded tile? */
function inTile(x: number, y: number): boolean {
  const r = g.radius;
  const cx = Math.min(Math.max(x, r), SIZE - r);
  const cy = Math.min(Math.max(y, r), SIZE - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inGlyph(x: number, y: number): boolean {
  if (x >= bar.x && x <= bar.x + bar.width && y >= bar.y && y <= bar.y + bar.height) return true;
  if (y < triTop || y > tipY) return false;
  // Half width of the triangle shrinks linearly from the top edge to the tip.
  const half = ((triRight - triLeft) / 2) * (1 - (y - triTop) / g.triangleHeight);
  return Math.abs(x - SIZE / 2) <= half;
}

function rasterize(px: number): Buffer {
  const samples = 8;
  const scale = SIZE / px;
  const rgba = Buffer.alloc(px * px * 4);
  for (let py = 0; py < px; py++) {
    for (let pxX = 0; pxX < px; pxX++) {
      let a = 0;
      let white = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (pxX + (sx + 0.5) / samples) * scale;
          const y = (py + (sy + 0.5) / samples) * scale;
          if (!inTile(x, y)) continue;
          a++;
          if (inGlyph(x, y)) white++;
        }
      }
      const i = (py * px + pxX) * 4;
      if (a === 0) continue;
      const t = white / a;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(RED[c]! * (1 - t) + WHITE[c]! * t);
      rgba[i + 3] = Math.round((a / (samples * samples)) * 255);
    }
  }
  return rgba;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(px: number): Buffer {
  const rgba = rasterize(px);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(px, 0);
  header.writeUInt32BE(px, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(6, 9); // RGBA
  const rows = Buffer.alloc(px * (px * 4 + 1));
  for (let y = 0; y < px; y++) {
    rows[y * (px * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (px * 4 + 1) + 1, y * px * 4, (y + 1) * px * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO container with PNG entries (supported by every browser that reads ICO). */
function ico(sizes: number[]): Buffer {
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((image, i) => {
    const entry = Buffer.alloc(16);
    const size = sizes[i]!;
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

const publicDir = new URL('../public/', import.meta.url);
writeFileSync(new URL('favicon.svg', publicDir), svg());
writeFileSync(new URL('favicon.ico', publicDir), ico([16, 32]));
console.log('wrote public/favicon.svg and public/favicon.ico');
