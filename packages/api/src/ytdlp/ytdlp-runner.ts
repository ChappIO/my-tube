import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import { buildArgs, describeArgs, type DownloadArgs, type MetadataArgs } from './args.js';
import { parseSourceMetadata, type SourceMetadata } from './metadata.js';
import { parseOutputLine, type DownloadProgress } from './progress.js';
import { YTDLP_BINARY, type YtdlpBinaryLocator } from './ytdlp-binary.js';
import { YtdlpError } from './ytdlp-error.js';

/**
 * Receives the full output of one yt-dlp run for a job log: first the command line (`$ …`,
 * cookies path and proxy credentials masked), then every stdout and stderr line as it arrives,
 * then `exit <code>`.
 */
export type YtdlpLogSink = (line: string) => void;

interface CallOptions {
  signal?: AbortSignal;
  /** Job log sink; see `YtdlpLogSink`. */
  log?: YtdlpLogSink;
}

export type MetadataOptions = Omit<MetadataArgs, 'url'> & CallOptions;
export type DownloadOptions = Omit<DownloadArgs, 'url'> & CallOptions;

export interface DownloadResult {
  /** Final path of the file after merging and moving, as yt-dlp reports it. */
  filePath: string;
}

interface RunOptions {
  signal?: AbortSignal;
  /** Called for each complete stdout or stderr line. */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Keep stdout in memory and return it (metadata). Otherwise it is only streamed. */
  collectStdout?: boolean;
  log?: YtdlpLogSink;
}

interface RunResult {
  stdout: string;
}

const STDERR_TAIL_LINES = 20;
/** How long a killed process gets to exit after SIGTERM before SIGKILL. */
const KILL_GRACE_MS = 5000;

/**
 * The only code in MyTube that spawns yt-dlp. It never uses a shell: arguments are built
 * by `buildArgs` and passed as an array, and URLs always follow `--`.
 */
@Injectable()
export class YtdlpRunner implements OnModuleDestroy {
  private readonly logger = new Logger('YtdlpRunner');
  private readonly running = new Set<ChildProcess>();

  constructor(@Inject(YTDLP_BINARY) private readonly binary: YtdlpBinaryLocator) {}

  /** `yt-dlp --version`, e.g. `2026.08.19`. */
  async version(options: { signal?: AbortSignal } = {}): Promise<string> {
    const { stdout } = await this.run(buildArgs({ kind: 'version' }), {
      ...options,
      collectStdout: true,
    });
    const version = stdout.trim().split('\n')[0]?.trim();
    if (!version) throw new YtdlpError('yt-dlp printed no version', 'output', 0, []);
    return version;
  }

  /** Lists a channel, playlist or video without downloading anything. */
  async metadata(url: string, options: MetadataOptions = {}): Promise<SourceMetadata> {
    const { signal, log, ...rest } = options;
    const { stdout } = await this.run(buildArgs({ kind: 'metadata', url, ...rest }), {
      signal,
      log,
      collectStdout: true,
    });
    let json: unknown;
    try {
      json = JSON.parse(stdout);
    } catch (error) {
      throw new YtdlpError('yt-dlp printed invalid JSON', 'output', 0, [], { cause: error });
    }
    try {
      return parseSourceMetadata(json, url);
    } catch (error) {
      const detail = error instanceof z.ZodError ? `: ${z.prettifyError(error)}` : '';
      throw new YtdlpError(`Unexpected yt-dlp metadata${detail}`, 'output', 0, [], {
        cause: error,
      });
    }
  }

  /**
   * Downloads one video to `options.output`, reporting progress as it goes. Resolves with
   * the final file path once post-processing is done.
   */
  async download(
    url: string,
    options: DownloadOptions,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<DownloadResult> {
    const { signal, log, ...rest } = options;
    let filePath: string | null = null;
    await this.run(buildArgs({ kind: 'download', url, ...rest }), {
      signal,
      log,
      onLine: (line) => {
        const parsed = parseOutputLine(line);
        if (parsed.type === 'file') filePath = parsed.path;
        else if (parsed.type === 'progress') onProgress?.(parsed.progress);
      },
    });
    if (!filePath) throw new YtdlpError('yt-dlp did not report a file path', 'output', 0, []);
    return { filePath };
  }

  onModuleDestroy(): void {
    for (const child of this.running) kill(child);
  }

  private run(args: string[], options: RunOptions): Promise<RunResult> {
    const { signal, collectStdout = false, log } = options;
    const onLine =
      log && options.onLine
        ? (line: string, stream: 'stdout' | 'stderr') => {
            log(line);
            options.onLine?.(line, stream);
          }
        : log
          ? (line: string) => log(line)
          : options.onLine;
    const binary = this.binary.path();

    return new Promise<RunResult>((resolve, reject) => {
      const tail: string[] = [];
      let settled = false;
      const fail = (error: YtdlpError) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      if (signal?.aborted) {
        fail(new YtdlpError('yt-dlp was aborted before it started', 'aborted', null, []));
        return;
      }

      this.logger.debug(`${binary} ${describeArgs(args)}`);
      log?.(`$ ${binary} ${describeArgs(args)}`);
      const child = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Own process group, so aborting also stops ffmpeg children (see `kill`).
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
      this.running.add(child);

      const stdoutChunks: Buffer[] = [];
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        kill(child);
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      const stdoutLines = lineSplitter((line) => onLine?.(line, 'stdout'));
      const stderrLines = lineSplitter((line) => {
        onLine?.(line, 'stderr');
        // Post-processing progress arrives on stderr; keep it out of the error tail.
        if (line.trim() === '' || parseOutputLine(line).type !== 'other') return;
        tail.push(line);
        if (tail.length > STDERR_TAIL_LINES) tail.shift();
      });

      child.stdout.on('data', (chunk: Buffer) => {
        if (collectStdout) stdoutChunks.push(chunk);
        if (onLine) stdoutLines.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => stderrLines.push(chunk));

      child.on('error', (error) => {
        this.running.delete(child);
        signal?.removeEventListener('abort', onAbort);
        fail(
          new YtdlpError(
            `Could not start yt-dlp at ${binary}: ${error.message}`,
            'spawn',
            null,
            [],
            {
              cause: error,
            },
          ),
        );
      });

      child.on('close', (code, closeSignal) => {
        this.running.delete(child);
        signal?.removeEventListener('abort', onAbort);
        stdoutLines.end();
        stderrLines.end();
        log?.(`exit ${code ?? closeSignal}${aborted ? ' (aborted)' : ''}`);
        if (aborted) {
          fail(new YtdlpError('yt-dlp was aborted', 'aborted', code, [...tail]));
        } else if (code !== 0) {
          const error = new YtdlpError('', 'exit', code, [...tail]);
          const reason = error.reason ?? tail.at(-1) ?? `signal ${closeSignal ?? 'unknown'}`;
          error.message = `yt-dlp exited with ${code ?? closeSignal}: ${reason}`;
          fail(error);
        } else if (!settled) {
          settled = true;
          resolve({ stdout: Buffer.concat(stdoutChunks).toString('utf8') });
        }
      });
    });
  }
}

/**
 * Buffers chunks and calls `onLine` per complete line (CR and LF both end a line). A
 * multibyte UTF-8 character split across chunks is held back until it is complete.
 */
export function lineSplitter(onLine: (line: string) => void) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  return {
    push(chunk: Buffer) {
      pending += decoder.write(chunk);
      const lines = pending.split(/\r\n|\r|\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    },
    end() {
      pending += decoder.end();
      if (pending) onLine(pending);
      pending = '';
    },
  };
}

/** SIGTERM the process group, then SIGKILL if it is still around after a grace period. */
function kill(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const signalGroup = (sig: NodeJS.Signals) => {
    try {
      if (child.pid && process.platform !== 'win32') process.kill(-child.pid, sig);
      else child.kill(sig);
    } catch {
      child.kill(sig);
    }
  };
  signalGroup('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalGroup('SIGKILL');
  }, KILL_GRACE_MS);
  timer.unref();
  child.once('close', () => clearTimeout(timer));
}
