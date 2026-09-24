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
  /** 0 to 100, or null when the total size is unknown. */
  percent: number | null;
  downloadedBytes: number | null;
  /** Exact total when known, otherwise yt-dlp's estimate, otherwise null. */
  totalBytes: number | null;
  speedBytesPerSec: number | null;
  etaSeconds: number | null;
  /** Post-processor name (e.g. `Merger`, `MoveFiles`) while post-processing. */
  postprocessor?: string;
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
  const total = raw.total_bytes ?? raw.total_bytes_estimate ?? null;
  let percent: number | null = null;
  if (status === 'finished') percent = 100;
  else if (downloaded !== null && total) percent = clamp((downloaded / total) * 100);
  else if (raw.fragment_index != null && raw.fragment_count) {
    percent = clamp((raw.fragment_index / raw.fragment_count) * 100);
  }

  return {
    status,
    percent: percent === null ? null : Math.round(percent * 10) / 10,
    downloadedBytes: downloaded,
    totalBytes: total === null ? null : Math.round(total),
    speedBytesPerSec: raw.speed == null ? null : Math.round(raw.speed),
    etaSeconds: raw.eta == null ? null : Math.round(raw.eta),
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
