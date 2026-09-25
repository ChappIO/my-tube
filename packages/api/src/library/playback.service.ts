import { execFile, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { subtitleTrackUrl, type SubtitleTrack, type VideoPlayback } from '@mytube/shared';
import type { Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { LibraryService } from './library.service.js';
import {
  TEXT_SUBTITLE_CODECS,
  describePlayback,
  languageLabel,
  normalizeLang,
  parseProbe,
  remuxArgs,
  sidecarSubtitles,
  subtitleArgs,
  type MediaProbe,
} from './playback.js';

/** ffprobe gets this long per file. */
export const PROBE_TIMEOUT_MS = 15_000;
/** Extracting one subtitle track may take this long (it reads through the whole file). */
export const SUBTITLE_TIMEOUT_MS = 120_000;
/** Probes kept in memory (per file path, size and modification time). */
export const PROBE_CACHE_SIZE = 500;

/** A subtitle track and where its text comes from. */
interface SubtitleSource {
  track: SubtitleTrack;
  /** The sidecar file (absolute), or the video for an embedded stream. */
  input: string;
  /** The subtitle stream of the video (embedded only). */
  n?: number;
  /** A `.vtt` sidecar is served as it is. */
  ready: boolean;
}

/**
 * Video playback in the browser (backend skill "Playback"): ffprobe per file (cached in memory
 * by path, size and mtime), the playback mode, the on-the-fly remux of an mkv into a fragmented
 * mp4 with ffmpeg, and the subtitle tracks (sidecars and embedded streams) as WebVTT, converted
 * once into `CONFIG_DIR/cache/subtitles`. ffprobe and ffmpeg are the ones on the PATH (yt-dlp's);
 * `FFPROBE_PATH` and `FFMPEG_PATH` override them.
 */
@Injectable()
export class PlaybackService {
  private readonly logger = new Logger('Playback');
  private readonly probes = new Map<string, MediaProbe>();
  private readonly converting = new Map<string, Promise<string>>();

  constructor(
    private readonly library: LibraryService,
    private readonly config: AppConfig,
  ) {}

  ffprobe(): string {
    return process.env.FFPROBE_PATH ?? 'ffprobe';
  }

  ffmpeg(): string {
    return process.env.FFMPEG_PATH ?? 'ffmpeg';
  }

  /** `GET /playback`: how `/play` serves the video and what ffprobe knows about it. */
  async playback(id: number): Promise<VideoPlayback> {
    const { path } = this.library.streamTarget(id);
    return describePlayback(path, await this.probe(path));
  }

  /** The file of a video and how `/play` serves it. 404 when it is not on disk. */
  async playTarget(id: number): Promise<{ path: string; playback: VideoPlayback }> {
    const { path } = this.library.streamTarget(id);
    return { path, playback: describePlayback(path, await this.probe(path)) };
  }

  /**
   * Streams `file` from `start` seconds as a fragmented mp4 (`video/mp4`, no length, no ranges).
   * The headers go out with ffmpeg's first bytes, so a file ffmpeg cannot read is a 500 with its
   * last error line. ffmpeg is killed as soon as the response closes (the player seeks by
   * reloading, which closes the previous request).
   */
  remux(file: string, start: number, res: Response): Promise<void> {
    const args = remuxArgs(file, start);
    this.logger.debug(`$ ${this.ffmpeg()} ${args.join(' ')}`);
    return new Promise((resolve) => {
      const child = spawn(this.ffmpeg(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let started = false;
      let stderr = '';
      const stop = () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      };
      res.on('close', stop);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      child.stdout.on('data', (chunk: Buffer) => {
        if (!started) {
          started = true;
          res.status(200);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Cache-Control', 'no-store');
        }
        if (!res.write(chunk)) {
          child.stdout.pause();
          res.once('drain', () => child.stdout.resume());
        }
      });
      const fail = (message: string) => {
        if (!res.headersSent) res.status(500).json({ statusCode: 500, message });
        else res.end();
      };
      child.on('error', (error) => {
        this.logger.warn(`ffmpeg could not start: ${error.message}`);
        fail(`ffmpeg could not start: ${error.message}`);
        resolve();
      });
      child.on('close', (code, signal) => {
        if (started) res.end();
        else if (!res.writableEnded && signal === null) {
          const last = stderr.trim().split('\n').at(-1) ?? '';
          fail(`ffmpeg could not remux this file (exit ${code})${last ? `: ${last}` : ''}`);
        }
        resolve();
      });
    });
  }

  /** `GET /subtitles`: the sidecars next to the video (by language), then its text streams. */
  async subtitles(id: number): Promise<SubtitleTrack[]> {
    return (await this.subtitleSources(id)).map((source) => source.track);
  }

  /**
   * The WebVTT of a subtitle track: a `.vtt` sidecar as it is, anything else converted by ffmpeg
   * into `CONFIG_DIR/cache/subtitles/<videoId>-<index>.vtt` once. The cached file is used while
   * it is newer than its source and the video's folder (a sidecar added or removed there
   * renumbers the tracks). 404 for an unknown index.
   */
  async subtitleFile(id: number, index: number): Promise<string> {
    const sources = await this.subtitleSources(id);
    const source = sources[index];
    if (!source) throw new NotFoundException(`Video ${id} has no subtitle track ${index}`);
    if (source.ready) return source.input;
    const cached = join(this.config.configDir, 'cache', 'subtitles', `${id}-${index}.vtt`);
    const { path } = this.library.streamTarget(id);
    const changed = Math.max(mtime(source.input), mtime(dirname(path)));
    if (mtime(cached) >= changed) return cached;
    const running = this.converting.get(cached);
    if (running) return running;
    const work = this.convert(source, cached).finally(() => this.converting.delete(cached));
    this.converting.set(cached, work);
    return work;
  }

  private async convert(source: SubtitleSource, target: string): Promise<string> {
    mkdirSync(dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    const args = subtitleArgs(source.input, temp, source.n);
    this.logger.debug(`$ ${this.ffmpeg()} ${args.join(' ')}`);
    try {
      await run(this.ffmpeg(), args, SUBTITLE_TIMEOUT_MS);
      renameSync(temp, target);
      return target;
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
  }

  private async subtitleSources(id: number): Promise<SubtitleSource[]> {
    const { path } = this.library.streamTarget(id);
    const folder = dirname(path);
    const stem = basename(path, extname(path));
    let names: string[] = [];
    try {
      names = readdirSync(folder);
    } catch {
      // The folder went away between the checks: no sidecars.
    }
    const sources: SubtitleSource[] = sidecarSubtitles(stem, names).map((sidecar) => ({
      track: {
        lang: sidecar.lang,
        label: languageLabel(sidecar.lang),
        kind: 'sidecar',
        url: '',
      },
      input: join(folder, sidecar.file),
      ready: sidecar.format === 'vtt',
    }));
    const probe = await this.probe(path);
    for (const stream of probe?.subtitles ?? []) {
      if (stream.codec !== null && !TEXT_SUBTITLE_CODECS.has(stream.codec)) continue;
      const lang = normalizeLang(stream.lang);
      const label = lang === 'und' && stream.title ? stream.title : languageLabel(lang);
      sources.push({
        track: { lang, label, kind: 'embedded', url: '' },
        input: path,
        n: stream.n,
        ready: false,
      });
    }
    return sources.map((source, index) => ({
      ...source,
      track: { ...source.track, url: subtitleTrackUrl(id, index) },
    }));
  }

  /** ffprobe of a file, cached per path, size and mtime; null when ffprobe cannot read it. */
  async probe(path: string): Promise<MediaProbe | null> {
    let key: string;
    try {
      const stat = statSync(path);
      key = `${path}\0${stat.size}\0${stat.mtimeMs}`;
    } catch {
      return null;
    }
    const known = this.probes.get(key);
    if (known) return known;
    try {
      const out = await run(
        this.ffprobe(),
        ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
        PROBE_TIMEOUT_MS,
      );
      const probe = parseProbe(JSON.parse(out));
      if (this.probes.size >= PROBE_CACHE_SIZE) {
        const oldest = this.probes.keys().next().value;
        if (oldest !== undefined) this.probes.delete(oldest);
      }
      this.probes.set(key, probe);
      return probe;
    } catch (error) {
      this.logger.warn(
        `ffprobe could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Runs a tool and resolves with its stdout; rejects with its last stderr line. */
function run(binary: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const last = stderr.trim().split('\n').at(-1) ?? '';
        reject(new Error(last ? `${error.message.split('\n')[0]}: ${last}` : error.message));
      },
    );
  });
}
