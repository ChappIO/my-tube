import type { VideoSettings } from '@mytube/shared';
import type { CaptionLanguages, ExpectedStream } from '../ytdlp/metadata.js';
import type { DownloadProgress } from '../ytdlp/progress.js';
import type { JobProgress } from '../jobs/job-runner.js';

type Quality = VideoSettings['quality'];
type Container = VideoSettings['container'];

/**
 * yt-dlp format selector for Settings → Video → Quality and Container: the best video stream
 * up to the chosen height plus the best audio, falling back to the best single file up to that
 * height. `mp4` and `webm` prefer streams that already fit the container (no re-encoding;
 * H.264/AAC for mp4, VP9/Opus for webm); `mkv` takes whatever is best.
 */
export function videoFormat(quality: Quality, container: Container): string {
  const height = quality === 'best' ? '' : `[height<=${Number.parseInt(quality, 10)}]`;
  const any = `bestvideo${height}+bestaudio/best${height}`;
  if (container === 'mp4') return `bestvideo${height}[ext=mp4]+bestaudio[ext=m4a]/${any}`;
  if (container === 'webm') return `bestvideo${height}[ext=webm]+bestaudio[ext=webm]/${any}`;
  return any;
}

/** Skips YouTube's machine-translated captions (yt-dlp README, youtube extractor `skip`). */
export const AUTO_SUBTITLES_EXTRACTOR_ARGS = 'youtube:skip=translated_subs';

/**
 * Extra yt-dlp flags from Settings → Video:
 * - `--remux-video <container>` so a single-file download also ends up in the chosen container
 *   (not for webm: H.264 cannot be remuxed into webm, so a fallback file keeps its own type).
 *   Merged downloads use `--merge-output-format`, which the caller passes separately.
 * - Subtitles: `--embed-subs --sub-langs en,nl` when embedded (no files are left next to the
 *   video), `--write-subs --sub-langs en,nl` for sidecar files. With generated subtitles on,
 *   `--write-auto-subs --extractor-args youtube:skip=translated_subs` as well: YouTube's
 *   automatic captions for a language without uploaded subtitles (uploaded ones win). With the
 *   video's `captions` known, `--sub-langs` keeps only the languages it really has (see
 *   `subtitleLanguages`), so machine translations are never fetched. No languages, no subtitles.
 * - Thumbnails: `--write-thumbnail --convert-thumbnails jpg`, a `<name>.jpg` sidecar next to
 *   the video, which Plex picks up as the poster.
 */
export function videoExtraArgs(video: VideoSettings, captions?: CaptionLanguages | null): string[] {
  const args: string[] = [];
  if (video.container !== 'webm') args.push('--remux-video', video.container);
  const { languages } = subtitleLanguages(video, captions);
  if (languages.length > 0) {
    // `--embed-subs` alone fetches the subtitles, embeds them and deletes the files; adding
    // `--write-subs` would keep the sidecar files as well.
    args.push(video.subtitlesEmbedded ? '--embed-subs' : '--write-subs');
    // `--write-auto-subs` only adds automatic captions to what is fetched; embedding still
    // removes the files afterwards. `skip=translated_subs` drops yt-dlp's translations of
    // uploaded subtitles (`nl-en`); machine translations of the automatic captions are listed
    // under plain codes and are left out by `subtitleLanguages` instead. A separate
    // `--extractor-args` per extractor combines with others, such as the metadata calls'
    // `youtubetab:approximate_date`.
    if (video.autoSubtitles) {
      args.push('--write-auto-subs', '--extractor-args', AUTO_SUBTITLES_EXTRACTOR_ARGS);
    }
    args.push('--sub-langs', languages.join(','));
  }
  if (video.saveThumbnails) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
  return args;
}

/**
 * The languages to ask yt-dlp for. Without generated subtitles, or when the video's captions
 * are unknown, the setting as it is. With them, only languages the video has uploaded
 * subtitles or automatic captions in (its spoken language): yt-dlp would otherwise take
 * YouTube's machine translation of the automatic captions for every other language, which is
 * poor and often refused with HTTP 429, failing the whole download. `skipped` lists the
 * languages left out.
 */
export function subtitleLanguages(
  video: VideoSettings,
  captions?: CaptionLanguages | null,
): { languages: string[]; skipped: string[] } {
  if (!video.autoSubtitles || !captions) return { languages: video.subtitleLanguages, skipped: [] };
  const available = new Set([...captions.uploaded, ...captions.generated]);
  const languages = video.subtitleLanguages.filter((lang) => available.has(lang));
  const skipped = video.subtitleLanguages.filter((lang) => !available.has(lang));
  return { languages, skipped };
}

// yt-dlp prints these (after `ERROR: [youtube] <id>: `) when a video is gone for good. Bot
// checks ("Sign in to confirm you're not a bot"), network errors and throttling are not here:
// those may pass on a retry. "Only available to Music Premium members" is a track YouTube sells
// on its own; without a Premium session it never downloads.
const UNAVAILABLE =
  /video unavailable|private video|has been removed|no longer available|account associated with this video has been terminated|members[- ]only|members on level|join this channel|premium members|premium[- ]only|copyright claim/i;

/** Whether a yt-dlp error reason means the video will never download (removed, private, …). */
export function isUnavailableReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && UNAVAILABLE.test(reason);
}

/** Share of the bar for fetching bytes; the rest up to 1 is post-processing and completion. */
export const DOWNLOAD_SHARE = 0.9;
/** How far each distinct post-processor moves the bar into the 0.9 to 0.99 band. */
export const POSTPROCESS_STEP = 0.011;
/** Steps counted at most, so the bar stays below 0.99 however many post-processors run. */
export const POSTPROCESS_MAX_STEPS = 8;

/**
 * Turns yt-dlp's per-stream progress into one job progress:
 *
 * - **0 to 0.9: downloading.** yt-dlp fetches the video stream and then the audio stream, each
 *   from 0 to 100 %. The bar is (finished streams' bytes + the current stream's share of its
 *   size) / (finished + current + the streams still to come). The streams and their expected
 *   sizes come from the metadata call made with the download's format selector
 *   (`SourceEntry.expectedStreams`), so the whole size is known up front and the bar runs once
 *   through all streams without moving backwards. A stream reports its own exact size once it
 *   starts, which replaces the expected one. When a size is unknown, yt-dlp's per-stream totals
 *   and estimates stand in: the bar may then step back when the audio stream reveals its size,
 *   but it never stands still while bytes arrive. Subtitle tracks (side files without a
 *   format) do not count.
 * - **0.9 to 0.99: post-processing.** Each distinct post-processor that runs after the
 *   download (Merger, VideoRemuxer, EmbedSubtitle, MoveFiles, …) moves the bar one step and
 *   becomes the job's `stage`. Post-processors that run before any stream (thumbnail
 *   conversion) only set the stage.
 * - **1: done**, written by the jobs service when the job completes.
 */
export class DownloadProgressTracker {
  /** Bytes of the media streams that finished. */
  private finishedBytes = 0;
  /** Index of the stream being fetched in `streams` (media streams finished so far). */
  private index = 0;
  private fraction = 0;
  private mediaSeen = false;
  private readonly steps = new Set<string>();
  /** Every expected stream has a size: the bar never moves backwards. */
  private readonly known: boolean;

  constructor(private readonly streams: readonly ExpectedStream[] = []) {
    this.known = streams.length > 0 && streams.every((stream) => stream.bytes !== null);
  }

  /** The report to make before the download starts: the expected size, when known. */
  start(): JobProgress {
    return this.known ? { totalBytes: this.later(0) } : {};
  }

  update(progress: DownloadProgress): JobProgress | null {
    if (progress.status === 'postprocessing') return this.postprocess(progress.postprocessor);
    // A side file (subtitles) is not part of the expected size.
    if (progress.formatId === null) return null;
    this.mediaSeen = true;

    // The current stream's size (its weight in the bar) and how far it is, 0 to 1.
    let size = 0;
    let shown = 0;
    let ratio: number | null = 0;
    if (progress.status === 'finished') {
      this.finishedBytes += progress.totalBytes ?? progress.downloadedBytes ?? 0;
      this.index += 1;
    } else {
      const planned = this.planned(progress.formatId);
      const exact = progress.estimated ? null : progress.totalBytes;
      const downloaded = progress.downloadedBytes ?? 0;
      size = exact ?? planned ?? progress.totalBytes ?? 0;
      if (exact) ratio = downloaded / exact;
      else if (progress.percent !== null) ratio = progress.percent / 100;
      else ratio = size > 0 ? downloaded / size : null;
      ratio = ratio === null ? null : Math.min(1, Math.max(0, ratio));
      // yt-dlp's estimate settles once some of the stream is in; before that, the plan.
      const estimate = progress.estimated && (ratio ?? 0) >= 0.1 ? progress.totalBytes : null;
      shown = exact ?? estimate ?? planned ?? progress.totalBytes ?? 0;
    }
    const later = this.later(progress.status === 'finished' ? this.index : this.index + 1);
    const total = this.finishedBytes + size + later;
    if (ratio !== null) {
      // No sizes at all (a single stream reporting only a percentage): the ratio is the bar.
      const share = this.share(total > 0 ? (this.finishedBytes + ratio * size) / total : ratio);
      this.fraction = this.known ? Math.max(this.fraction, share) : share;
    }
    const finished = progress.status === 'finished';
    const totalBytes = this.finishedBytes + shown + later;
    return {
      progress: this.fraction,
      speedBytesPerSec: finished ? null : progress.speedBytesPerSec,
      etaSeconds: finished ? null : progress.etaSeconds,
      totalBytes: totalBytes > 0 ? totalBytes : null,
      stage: null,
    };
  }

  /** The expected size of the stream being fetched, unless yt-dlp fetches another format. */
  private planned(formatId: string | undefined): number | null {
    const stream = this.streams[this.index];
    if (!stream) return null;
    if (formatId && stream.formatId && formatId !== stream.formatId) return null;
    return stream.bytes;
  }

  /** Expected bytes of the streams from `index` on. */
  private later(index: number): number {
    return this.streams.slice(index).reduce((sum, stream) => sum + (stream.bytes ?? 0), 0);
  }

  private postprocess(name: string | undefined): JobProgress {
    const stage = name ?? null;
    const idle = { speedBytesPerSec: null, etaSeconds: null, stage };
    if (!this.mediaSeen) return idle;
    if (stage) this.steps.add(stage);
    const steps = Math.min(this.steps.size, POSTPROCESS_MAX_STEPS);
    this.fraction = Math.max(this.fraction, DOWNLOAD_SHARE + steps * POSTPROCESS_STEP);
    return { ...idle, progress: this.fraction };
  }

  private share(ratio: number): number {
    return Math.min(DOWNLOAD_SHARE, Math.max(0, ratio) * DOWNLOAD_SHARE);
  }
}
