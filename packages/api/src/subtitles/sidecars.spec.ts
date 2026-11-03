import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  listSidecars,
  missingLanguages,
  presentLanguages,
  renameOrigSidecars,
  withoutOrigSuffix,
} from './sidecars.js';

describe('withoutOrigSuffix', () => {
  it('renames only subtitle sidecars of a -orig track', () => {
    expect(withoutOrigSuffix('Video (2026-09-04).en-orig.vtt')).toBe('Video (2026-09-04).en.vtt');
    expect(withoutOrigSuffix('Video.nl-NL-orig.srt')).toBe('Video.nl-NL.srt');
    expect(withoutOrigSuffix('Video.en.vtt')).toBeNull();
    expect(withoutOrigSuffix('Video.en-orig.jpg')).toBeNull();
    expect(withoutOrigSuffix('Video-orig.vtt')).toBeNull();
  });
});

describe('sidecars on disk', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('lists, renames and leaves a plain name alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mytube-sidecars-'));
    dirs.push(dir);
    const file = join(dir, 'Video.mp4');
    writeFileSync(file, 'media');
    writeFileSync(join(dir, 'Video.en-orig.vtt'), 'WEBVTT');
    writeFileSync(join(dir, 'Video.nl.vtt'), 'WEBVTT');
    writeFileSync(join(dir, 'Video.nl-orig.vtt'), 'WEBVTT');
    writeFileSync(join(dir, 'Video.jpg'), 'jpg');
    const lines: string[] = [];
    renameOrigSidecars(file, (line) => lines.push(line));
    expect(readdirSync(dir).toSorted()).toEqual([
      'Video.en.vtt',
      'Video.jpg',
      'Video.mp4',
      'Video.nl-orig.vtt',
      'Video.nl.vtt',
    ]);
    expect(lines).toEqual(['renamed Video.en-orig.vtt to Video.en.vtt']);
    expect(listSidecars(file).map((sidecar) => sidecar.lang)).toEqual(['en', 'nl', 'nl-orig']);
    expect(listSidecars(join(dir, 'missing', 'Video.mp4'))).toEqual([]);
  });
});

describe('presentLanguages and missingLanguages', () => {
  it('combines sidecars and embedded streams and matches on the base language', () => {
    const present = presentLanguages(
      [{ lang: 'en' }],
      [
        { n: 0, codec: 'mov_text', lang: 'nld', title: null },
        { n: 1, codec: 'mov_text', lang: null, title: 'Commentary' },
        { n: 2, codec: 'mov_text', lang: 'en', title: null },
      ],
    );
    expect(present).toEqual(['en', 'nl']);
    expect(missingLanguages(['en', 'nl', 'de'], present)).toEqual(['de']);
    expect(missingLanguages(['en-US'], ['en'])).toEqual([]);
    expect(missingLanguages(['pt-BR'], [])).toEqual(['pt-BR']);
  });
});
