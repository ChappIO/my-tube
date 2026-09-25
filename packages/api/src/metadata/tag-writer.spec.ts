import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagWriter, tagWriteArgs } from './tag-writer.js';

// A stand-in for ffmpeg: writes the -metadata values into the output (or fails on demand).
const FAKE_FFMPEG = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAKE_FFMPEG_FAIL) {
  fs.writeFileSync(args.at(-1), 'half');
  process.stderr.write('Invalid data found when processing input\\n');
  process.exit(1);
}
const input = fs.readFileSync(args[args.indexOf('-i') + 1], 'utf8');
const tags = args.filter((_, i) => args[i - 1] === '-metadata');
fs.writeFileSync(args.at(-1), input + '|' + tags.join(';'));
`;

describe('tagWriteArgs', () => {
  it('copies every stream and replaces only the given tags', () => {
    expect(
      tagWriteArgs('/m/a.m4a', '/m/.a.tagging.m4a', {
        title: 'Ignored',
        album: 'Mood Valiant',
        albumArtist: 'Hiatus Kaiyote',
        trackNumber: 9,
        discNumber: 1,
        year: 2021,
      }),
    ).toEqual([
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      '/m/a.m4a',
      '-map',
      '0',
      '-c',
      'copy',
      '-metadata',
      'album=Mood Valiant',
      '-metadata',
      'album_artist=Hiatus Kaiyote',
      '-metadata',
      'track=9',
      '-metadata',
      'disc=1',
      '-metadata',
      'date=2021',
      '/m/.a.tagging.m4a',
    ]);
  });
});

describe('TagWriter (fake ffmpeg)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-tag-writer-'));
    const binary = join(root, 'ffmpeg');
    writeFileSync(binary, FAKE_FFMPEG);
    chmodSync(binary, 0o755);
    process.env.FFMPEG_PATH = binary;
  });

  afterEach(() => {
    delete process.env.FFMPEG_PATH;
    delete process.env.FAKE_FFMPEG_FAIL;
    rmSync(root, { recursive: true, force: true });
  });

  it('rewrites the file through a hidden temp file next to it', async () => {
    const file = join(root, '09 Red Room.m4a');
    writeFileSync(file, 'audio');
    const log: string[] = [];
    await new TagWriter().write(file, { year: 2021, discNumber: 1 }, { log: (l) => log.push(l) });
    expect(readFileSync(file, 'utf8')).toBe('audio|disc=1;date=2021');
    expect(readdirSync(root).toSorted()).toEqual(['09 Red Room.m4a', 'ffmpeg']);
    expect(log[0]).toContain('.09 Red Room.tagging.m4a');
  });

  it('leaves the original untouched and removes the temp file when ffmpeg fails', async () => {
    const file = join(root, 'a.m4a');
    writeFileSync(file, 'audio');
    process.env.FAKE_FFMPEG_FAIL = '1';
    await expect(new TagWriter().write(file, { year: 2021 })).rejects.toThrow(
      'ffmpeg exited with 1: Invalid data found when processing input',
    );
    expect(readFileSync(file, 'utf8')).toBe('audio');
    expect(existsSync(join(root, '.a.tagging.m4a'))).toBe(false);
  });
});
