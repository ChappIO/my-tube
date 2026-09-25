import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutsideLibraryError, libraryPath, removeMediaFiles } from './media-files.js';

describe('removeMediaFiles', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-files-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const touch = (path: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), 'x');
  };

  it('removes the file, its sidecars and the folders it leaves empty', () => {
    for (const name of [
      'A/B/Talk (2026-01-01).mkv',
      'A/B/Talk (2026-01-01).jpg',
      'A/B/Talk (2026-01-01).en.vtt',
      'A/B/Talk (2026-01-01).pt-BR.srt',
    ]) {
      touch(name);
    }
    expect(removeMediaFiles(root, 'A/B/Talk (2026-01-01).mkv')).toEqual([
      'Talk (2026-01-01).mkv',
      'Talk (2026-01-01).en.vtt',
      'Talk (2026-01-01).jpg',
      'Talk (2026-01-01).pt-BR.srt',
    ]);
    expect(existsSync(join(root, 'A'))).toBe(false);
    expect(existsSync(root)).toBe(true);
  });

  it('leaves other files with the same stem and non-empty folders alone', () => {
    touch('A/Talk.mkv');
    touch('A/Talk.part2.mkv');
    touch('A/Talk.notes.txt');
    touch('A/Other.mkv');
    removeMediaFiles(root, 'A/Talk.mkv');
    expect(readdirSync(join(root, 'A')).toSorted()).toEqual([
      'Other.mkv',
      'Talk.notes.txt',
      'Talk.part2.mkv',
    ]);
  });

  it('does not mind a file that is already gone', () => {
    expect(removeMediaFiles(root, 'Gone/Talk.mkv')).toEqual(['Talk.mkv']);
  });

  it('refuses paths outside the library', () => {
    expect(() => libraryPath(root, '../etc/passwd')).toThrow(OutsideLibraryError);
    expect(() => removeMediaFiles(root, '/etc/passwd')).toThrow(OutsideLibraryError);
    expect(libraryPath(root, 'A/b.mkv')).toBe(join(root, 'A/b.mkv'));
  });
});
