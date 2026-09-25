import { z } from 'zod';
import { FILE_MARKER, PROGRESS_MARKER } from './args.js';

/**
 * - `downloading`: bytes are arriving.
 * - `finished`: one stream is complete. A video with separate video and audio streams
 *   goes downloading, finished, downloading, finished, so percent restarts once.
 * - `postprocessing`: merging, remuxing, embedding or moving the file.
 */
export type DownloadStatus = 'downloading' | 'finished' | 'postprocessing';

export interface DownloadProgress {
  status: DownloadStatus;
  /**
   * 0 to 100 through this stream: by bytes when the exact size is known, else by fragments
   * (HLS and DASH fragment downloads), else by bytes against yt-dlp's estimate; null when
   * nothing is known.
   */
  percent: number | null;
  downloadedBytes: number | null;
  /** Exact total when known, otherwise yt-dlp's estimate, otherwise null. */
  totalBytes: number | null;
  /**
   * True when `totalBytes` is yt-dlp's estimate. For fragment downloads the estimate is the
   * bytes so far extrapolated over the fragments, which is far off for the first fragments.
   */
  estimated?: boolean;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  /** Post-processor name (e.g. `Merger`, `MoveFiles`) while post-processing. */
  postprocessor?: string;
  /**
   * The yt-dlp format being fetched (`398`, `140-20`): a media stream. Null for a side file
   * without a format, such as a subtitle track; absent when the line did not say.
   */
  formatId?: string | null;
}

const num = z.number().nullish().catch(null);

const RawProgress = z.object({
  status: z.string(),
  downloaded_bytes: num,
  total_bytes: num,
  total_bytes_estimate: num,
  speed: num,
  eta: num,
  fragment_index: num,
  fragment_count: num,
  postprocessor: z.string().nullish().catch(null),
});

/** Download lines wrap the progress fields with the stream's format id (see `buildArgs`). */
const Wrapped = z.object({ format_id: z.string().nullish().catch(null), progress: z.unknown() });

export type OutputLine =
  | { type: 'progress'; progress: DownloadProgress }
  | { type: 'file'; path: string }
  | { type: 'other'; line: string };

/** Classifies one line of yt-dlp output (stdout or stderr) produced by a download. */
export function parseOutputLine(line: string): OutputLine {
  if (line.startsWith(FILE_MARKER)) {
    return { type: 'file', path: line.slice(FILE_MARKER.length) };
  }
  if (line.startsWith(PROGRESS_MARKER)) {
    const progress = parseProgress(line.slice(PROGRESS_MARKER.length));
    if (progress) return { type: 'progress', progress };
  }
  return { type: 'other', line };
}

function parseProgress(json: string): DownloadProgress | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  let formatId: string | null | undefined;
  const wrapped = Wrapped.safeParse(data);
  if (wrapped.success && wrapped.data.progress !== undefined) {
    formatId = wrapped.data.format_id || null;
    data = wrapped.data.progress;
  }
  const parsed = RawProgress.safeParse(data);
  if (!parsed.success) return null;
  const raw = parsed.data;

  // Post-processor hooks report started/processing/finished and carry a processor name.
  if (raw.postprocessor) {
    return {
      status: 'postprocessing',
      percent: null,
      downloadedBytes: null,
      totalBytes: null,
      speedBytesPerSec: null,
      etaSeconds: null,
      postprocessor: raw.postprocessor,
    };
  }

  const status: DownloadStatus = raw.status === 'finished' ? 'finished' : 'downloading';
  const downloaded = raw.downloaded_bytes ?? null;
  const exact = raw.total_bytes ?? null;
  const total = exact ?? raw.total_bytes_estimate ?? null;
  let percent: number | null = null;
  if (status === 'finished') percent = 100;
  else if (downloaded !== null && exact) percent = clamp((downloaded / exact) * 100);
  else if (raw.fragment_index != null && raw.fragment_count) {
    percent = clamp((raw.fragment_index / raw.fragment_count) * 100);
  } else if (downloaded !== null && total) percent = clamp((downloaded / total) * 100);

  return {
    status,
    percent: percent === null ? null : Math.round(percent * 10) / 10,
    downloadedBytes: downloaded,
    totalBytes: total === null ? null : Math.round(total),
    ...(exact === null && total !== null ? { estimated: true } : {}),
    speedBytesPerSec: raw.speed == null ? null : Math.round(raw.speed),
    etaSeconds: raw.eta == null ? null : Math.round(raw.eta),
    ...(formatId === undefined ? {} : { formatId }),
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
