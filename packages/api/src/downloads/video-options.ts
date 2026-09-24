import type { VideoSettings } from '@mytube/shared';
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

/**
 * Extra yt-dlp flags from Settings → Video:
 * - `--remux-video <container>` so a single-file download also ends up in the chosen container
 *   (not for webm: H.264 cannot be remuxed into webm, so a fallback file keeps its own type).
 *   Merged downloads use `--merge-output-format`, which the caller passes separately.
 * - Subtitles: `--embed-subs --sub-langs en,nl` when embedded (no files are left next to the
 *   video), `--write-subs --sub-langs en,nl` for sidecar files. No languages, no subtitles.
 * - Thumbnails: `--write-thumbnail --convert-thumbnails jpg`, a `<name>.jpg` sidecar next to
 *   the video, which Plex picks up as the poster.
 */
export function videoExtraArgs(video: VideoSettings): string[] {
  const args: string[] = [];
  if (video.container !== 'webm') args.push('--remux-video', video.container);
  if (video.subtitleLanguages.length > 0) {
    // `--embed-subs` alone fetches the subtitles, embeds them and deletes the files; adding
    // `--write-subs` would keep the sidecar files as well.
    args.push(
      video.subtitlesEmbedded ? '--embed-subs' : '--write-subs',
      '--sub-langs',
      video.subtitleLanguages.join(','),
    );
  }
  if (video.saveThumbnails) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
  return args;
}

// yt-dlp prints these (after `ERROR: [youtube] <id>: `) when a video is gone for good. Bot
// checks ("Sign in to confirm you're not a bot"), network errors and throttling are not here:
// those may pass on a retry.
const UNAVAILABLE =
  /video unavailable|private video|has been removed|no longer available|account associated with this video has been terminated|members[- ]only|join this channel|copyright claim/i;

/** Whether a yt-dlp error reason means the video will never download (removed, private, …). */
export function isUnavailableReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && UNAVAILABLE.test(reason);
}

/**
 * Turns yt-dlp's per-stream progress into one job progress. yt-dlp downloads the video stream
 * and then the audio stream, each from 0 to 100 %; this adds the finished streams' bytes so the
 * bar runs once from 0 to 1 and never moves backwards (the audio's size is unknown until it
 * starts, so the total grows a little then). It stays below 1 until the job completes.
 */
export class DownloadProgressTracker {
  private finishedBytes = 0;
  private fraction = 0;

  update(progress: DownloadProgress): JobProgress | null {
    if (progress.status === 'postprocessing') {
      return { speedBytesPerSec: null, etaSeconds: null };
    }
    if (progress.status === 'finished') {
      this.finishedBytes += progress.totalBytes ?? progress.downloadedBytes ?? 0;
      return { totalBytes: this.finishedBytes || null, etaSeconds: null };
    }
    const total = this.finishedBytes + (progress.totalBytes ?? 0);
    const done = this.finishedBytes + (progress.downloadedBytes ?? 0);
    const raw =
      progress.totalBytes && total > 0
        ? done / total
        : progress.percent === null
          ? 0
          : progress.percent / 100;
    this.fraction = Math.max(this.fraction, Math.min(raw, 0.99));
    return {
      progress: this.fraction,
      speedBytesPerSec: progress.speedBytesPerSec,
      etaSeconds: progress.etaSeconds,
      totalBytes: total > 0 ? total : null,
    };
  }
}
