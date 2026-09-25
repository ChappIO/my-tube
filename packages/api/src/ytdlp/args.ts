/**
 * Pure argument building for yt-dlp. Every invocation the runner makes goes through
 * `buildArgs`, so what we pass to the binary is unit-tested without spawning anything.
 */

/** Network settings applied to every call that talks to YouTube. All optional. */
export interface NetworkOptions {
  /** Max download rate: bytes per second, or yt-dlp's notation such as `500K` or `4.2M`. */
  rateLimit?: number | string;
  /** Proxy URL, e.g. `socks5://127.0.0.1:1080` or `http://user:pass@host:3128`. */
  proxy?: string;
  /** Path to a Netscape-format cookies file. */
  cookiesFile?: string;
}

export interface MetadataArgs {
  url: string;
  /** Only fetch the first N entries (per level: a channel's tabs and each tab's items). */
  limit?: number;
  /**
   * Ask the YouTube tab extractor for approximate upload dates in flat listings. Without
   * it channel entries carry no date at all. Defaults to true.
   */
  approximateDates?: boolean;
  /**
   * Format selector (`-f`) to resolve, as the download will use it. For a single video yt-dlp
   * then reports the chosen streams (`requested_formats`) and their sizes, which become the
   * entry's `expectedBytes`. Omitted: yt-dlp's default selection.
   */
  format?: string;
  network?: NetworkOptions;
}

export interface DownloadArgs {
  url: string;
  /** Output template (`-o`), normally an absolute path template ending in `.%(ext)s`. */
  output: string;
  /** Format selector (`-f`). yt-dlp's default when omitted. */
  format?: string;
  /** Container to merge separate video and audio streams into (`--merge-output-format`). */
  mergeOutputFormat?: string;
  /** Further flags such as `--embed-thumbnail` or `--write-subs`. See `RESERVED_FLAGS`. */
  extraArgs?: readonly string[];
  network?: NetworkOptions;
}

export type YtdlpCommand =
  | { kind: 'version' }
  | ({ kind: 'metadata' } & MetadataArgs)
  | ({ kind: 'download' } & DownloadArgs);

/** Prefix of the progress lines our template makes yt-dlp print. */
export const PROGRESS_MARKER = '[mytube-progress] ';
/** Prefix of the final file path line printed after all post-processing. */
export const FILE_MARKER = '[mytube-file] ';

const DOWNLOAD_PROGRESS_FIELDS =
  'status,downloaded_bytes,total_bytes,total_bytes_estimate,speed,eta,fragment_index,fragment_count';

/**
 * Flags the runner controls itself. Passing them in `extraArgs` would break progress or
 * result parsing, bypass NetworkOptions, or run arbitrary commands, so they are refused.
 */
export const RESERVED_FLAGS: ReadonlySet<string> = new Set([
  '-o',
  '--output',
  '-P',
  '--paths',
  '--print',
  '-O',
  '--print-to-file',
  '--progress-template',
  '--newline',
  '--quiet',
  '-q',
  '--no-progress',
  '-j',
  '--dump-json',
  '-J',
  '--dump-single-json',
  '--exec',
  '--config-locations',
  '--cookies',
  '--cookies-from-browser',
  '--proxy',
  '--limit-rate',
  '-r',
  '--batch-file',
  '-a',
  '--',
]);

const RATE_PATTERN = /^\d+(\.\d+)?[KMGTP]?$/i;

export function networkArgs(network: NetworkOptions | undefined): string[] {
  if (!network) return [];
  const args: string[] = [];
  if (network.rateLimit !== undefined && network.rateLimit !== '') {
    const rate = String(network.rateLimit).trim();
    if (!RATE_PATTERN.test(rate)) throw new Error(`Invalid rate limit: ${rate}`);
    args.push('--limit-rate', rate);
  }
  if (network.proxy) args.push('--proxy', network.proxy);
  if (network.cookiesFile) args.push('--cookies', network.cookiesFile);
  return args;
}

// Shared by every call: never read user or system config files (the container is the
// only config), and never colour output we parse.
const BASE_ARGS = ['--ignore-config', '--color', 'never'];

export function buildArgs(command: YtdlpCommand): string[] {
  if (command.kind === 'version') return ['--version'];
  if (command.kind === 'metadata') {
    const args = [
      ...BASE_ARGS,
      '--dump-single-json',
      '--flat-playlist',
      '--skip-download',
      '--no-warnings',
    ];
    if (command.limit !== undefined) {
      if (!Number.isInteger(command.limit) || command.limit < 1) {
        throw new Error(`Invalid limit: ${command.limit}`);
      }
      args.push('--playlist-items', `1:${command.limit}`);
    }
    if (command.approximateDates ?? true) {
      args.push('--extractor-args', 'youtubetab:approximate_date');
    }
    if (command.format) args.push('-f', command.format);
    args.push(...networkArgs(command.network), '--', command.url);
    return args;
  }
  // download
  for (const arg of command.extraArgs ?? []) {
    const flag = arg.split('=', 1)[0]!;
    if (RESERVED_FLAGS.has(flag)) throw new Error(`Reserved yt-dlp flag in extraArgs: ${flag}`);
  }
  const args = [
    ...BASE_ARGS,
    '--no-playlist',
    '--newline',
    // --print below implies --quiet, which would otherwise hide progress.
    '--progress',
    '--progress-delta',
    '1',
    // The format id tells media streams from side files (subtitles have none).
    '--progress-template',
    `download:${PROGRESS_MARKER}{"format_id":"%(info.format_id|)s","progress":%(progress.{${DOWNLOAD_PROGRESS_FIELDS}})j}`,
    '--progress-template',
    `postprocess:${PROGRESS_MARKER}%(progress.{status,postprocessor})j`,
    '--print',
    `after_move:${FILE_MARKER}%(filepath)s`,
    '-o',
    command.output,
  ];
  if (command.format) args.push('-f', command.format);
  if (command.mergeOutputFormat) {
    args.push('--merge-output-format', command.mergeOutputFormat);
  }
  args.push(...(command.extraArgs ?? []), ...networkArgs(command.network), '--', command.url);
  return args;
}

/**
 * A loggable rendering of an argument list: cookie file paths are hidden and proxy
 * credentials are masked.
 */
export function describeArgs(args: readonly string[]): string {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const previous = args[i - 1];
    if (previous === '--cookies') out.push('<redacted>');
    else if (previous === '--proxy') out.push(maskProxy(arg));
    else out.push(/[\s"'$]/.test(arg) ? JSON.stringify(arg) : arg);
  }
  return out.join(' ');
}

function maskProxy(proxy: string): string {
  try {
    const url = new URL(proxy);
    if (url.username || url.password) {
      url.username = '***';
      url.password = '';
    }
    return url.toString();
  } catch {
    return '<proxy>';
  }
}
