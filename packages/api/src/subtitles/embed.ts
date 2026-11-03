import { spawn } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { baseLanguage } from '../ytdlp/metadata.js';

/*
 * Embedding subtitle sidecars into a video that is already on disk (the `subtitles` job with
 * Settings → Video → Subtitles "embedded"): ffmpeg copies every stream of the file and adds the
 * sidecars as text subtitle streams, into a temp file that then replaces the original.
 */

/** An embed may take this long (a remux of one video, no encoding). */
export const EMBED_TIMEOUT_MS = 10 * 60_000;

/** ISO 639-2 codes for the languages Settings offers, as containers tag subtitle streams. */
const ISO_639_2: Readonly<Record<string, string>> = {
  en: 'eng',
  nl: 'nld',
  de: 'deu',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  ja: 'jpn',
  ko: 'kor',
  zh: 'zho',
  ru: 'rus',
  uk: 'ukr',
  pl: 'pol',
  cs: 'ces',
  sk: 'slk',
  hu: 'hun',
  ro: 'ron',
  bg: 'bul',
  el: 'ell',
  sv: 'swe',
  no: 'nor',
  da: 'dan',
  fi: 'fin',
  is: 'isl',
  et: 'est',
  lv: 'lav',
  lt: 'lit',
  hr: 'hrv',
  sr: 'srp',
  sl: 'slv',
  tr: 'tur',
  ar: 'ara',
  he: 'heb',
  fa: 'fas',
  hi: 'hin',
  bn: 'ben',
  ur: 'urd',
  id: 'ind',
  ms: 'msa',
  th: 'tha',
  vi: 'vie',
  fil: 'fil',
  sw: 'swa',
  af: 'afr',
  ca: 'cat',
  eu: 'eus',
};

/** The container's language tag for a Settings code (`en-US` → `eng`); null when unknown. */
export function iso6392(lang: string): string | null {
  return ISO_639_2[baseLanguage(lang)] ?? null;
}

/** The text subtitle codec a container carries. */
export function subtitleCodec(ext: string): 'mov_text' | 'webvtt' | 'srt' {
  const lower = ext.toLowerCase().replace(/^\./, '');
  if (lower === 'mp4' || lower === 'm4v' || lower === 'mov') return 'mov_text';
  if (lower === 'webm') return 'webvtt';
  return 'srt';
}

/**
 * The ffmpeg arguments that copy `input` to `output` with `sidecars` added as subtitle streams:
 * `-map 0` keeps every stream (`existing` of them subtitles already, which keep their index), the
 * sidecars follow, every subtitle stream in the container's text codec, the language tagged.
 */
export function embedArgs(
  input: string,
  output: string,
  sidecars: readonly { file: string; lang: string }[],
  existing: number,
): string[] {
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', input];
  for (const sidecar of sidecars) args.push('-i', sidecar.file);
  args.push('-map', '0');
  sidecars.forEach((_, i) => args.push('-map', String(i + 1)));
  args.push('-c', 'copy', '-c:s', subtitleCodec(extname(output)));
  sidecars.forEach((sidecar, i) => {
    const iso = iso6392(sidecar.lang);
    const stream = `-metadata:s:s:${existing + i}`;
    if (iso) args.push(stream, `language=${iso}`);
    args.push(stream, `title=${sidecar.lang}`);
  });
  args.push(output);
  return args;
}

export interface EmbedOptions {
  signal?: AbortSignal;
  log?: (line: string) => void;
}

/**
 * Embeds subtitle sidecars into a video on disk through a hidden temp file next to it
 * (`.<name>.subtitles.<ext>`), which replaces the original once ffmpeg is done; on any failure
 * the temp file is removed and the original stays. The sidecars are left for the caller.
 * ffmpeg is the one yt-dlp uses (on the PATH; `FFMPEG_PATH` overrides it).
 */
@Injectable()
export class SubtitleEmbedder {
  binary(): string {
    return process.env.FFMPEG_PATH ?? 'ffmpeg';
  }

  async embed(
    file: string,
    sidecars: readonly { file: string; lang: string }[],
    existing: number,
    options: EmbedOptions = {},
  ): Promise<void> {
    const ext = extname(file);
    const temp = join(dirname(file), `.${basename(file, ext)}.subtitles${ext}`);
    const args = embedArgs(file, temp, sidecars, existing);
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
    const timeout = AbortSignal.timeout(EMBED_TIMEOUT_MS);
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
