import { spawn } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ENRICHED_FIELDS, type EnrichedField } from './provider.js';
import type { TrackTags } from './ytdlp-tags.js';

/** `TrackTags` field → the ffmpeg metadata key (ffmpeg maps it to each container's own tag). */
const FFMPEG_KEYS: Record<EnrichedField, string> = {
  album: 'album',
  albumArtist: 'album_artist',
  trackNumber: 'track',
  discNumber: 'disc',
  year: 'date',
};

/** A tag rewrite may take this long (a remux of one audio file, no encoding). */
export const TAG_WRITE_TIMEOUT_MS = 120_000;

/** The ffmpeg arguments that copy `input` to `output` with the given tags replaced. */
export function tagWriteArgs(input: string, output: string, tags: Partial<TrackTags>): string[] {
  const metadata: string[] = [];
  for (const field of ENRICHED_FIELDS) {
    const value = tags[field];
    if (value === undefined || value === null || value === '') continue;
    metadata.push('-metadata', `${FFMPEG_KEYS[field]}=${String(value)}`);
  }
  // `-map 0 -c copy`: every stream as is (the audio and the embedded cover), no re-encode;
  // the file's other tags come along (`-map_metadata 0` is ffmpeg's default).
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-map',
    '0',
    '-c',
    'copy',
    ...metadata,
    output,
  ];
}

export interface TagWriteOptions {
  signal?: AbortSignal;
  log?: (line: string) => void;
}

/**
 * Writes tags into a downloaded track after the fact: ffmpeg re-muxes the file into a hidden
 * temp file next to it with the new values (`-c copy`, so no re-encode and the cover stays),
 * which then replaces the original. On any failure the temp file is removed and the original
 * stays untouched. ffmpeg is the one yt-dlp uses (on the PATH; `FFMPEG_PATH` overrides it).
 */
@Injectable()
export class TagWriter {
  binary(): string {
    return process.env.FFMPEG_PATH ?? 'ffmpeg';
  }

  async write(
    file: string,
    tags: Partial<TrackTags>,
    options: TagWriteOptions = {},
  ): Promise<void> {
    const ext = extname(file);
    const temp = join(dirname(file), `.${basename(file, ext)}.tagging${ext}`);
    const args = tagWriteArgs(file, temp, tags);
    options.log?.(`$ ${this.binary()} ${args.join(' ')}`);
    try {
      await run(this.binary(), args, options.signal);
      renameSync(temp, file);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
  }
}

function run(binary: string, args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = AbortSignal.timeout(TAG_WRITE_TIMEOUT_MS);
    const child = spawn(binary, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const last = stderr.trim().split('\n').at(-1) ?? '';
        reject(new Error(`ffmpeg exited with ${code}${last ? `: ${last}` : ''}`));
      }
    });
  });
}
