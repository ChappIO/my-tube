import { z } from 'zod';

/*
 * Video playback in the browser (`/api/library/videos/:id/{playback,play,subtitles}`, backend
 * skill "Playback"). Browsers play mp4 and webm files as they are; an mkv is remuxed on the fly
 * into a fragmented mp4 when its codecs play in one; anything else plays in Plex only.
 */

/**
 * How `/play` answers: `direct` redirects to the file (`/stream`, native seeking), `remux`
 * streams an fMP4 made from the mkv without re-encoding (seeking reloads with `?t=`),
 * `unsupported` is a 415 with `UNPLAYABLE_VIDEO_MESSAGE`.
 */
export const PLAYBACK_MODES = ['direct', 'remux', 'unsupported'] as const;
export const PlaybackMode = z.enum(PLAYBACK_MODES);
export type PlaybackMode = z.infer<typeof PlaybackMode>;

/** The 415 message of `/play` and the player's error line for such a file. */
export const UNPLAYABLE_VIDEO_MESSAGE = 'This file cannot play in the browser. Plex plays it.';

/**
 * Video codecs (ffprobe's `codec_name`) an mkv may carry to be remuxed into mp4: the ones
 * Chromium, Firefox and Safari play in an mp4.
 */
export const REMUX_VIDEO_CODECS = ['h264', 'vp9', 'av1'] as const;
/** Audio codecs an mkv may carry to be remuxed into mp4. */
export const REMUX_AUDIO_CODECS = ['aac', 'mp3', 'opus', 'flac'] as const;

/** `GET /api/library/videos/:id/playback`: what the player needs before it loads `/play`. */
export const VideoPlayback = z.object({
  mode: PlaybackMode,
  /** What `/play` sends: the file's type (direct), `video/mp4` (remux). */
  mimeType: z.string().nullable(),
  /** ffprobe's codec names of the first video and audio stream; null when unknown. */
  videoCodec: z.string().nullable(),
  audioCodec: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  /** The element seeks natively (direct); otherwise the player reloads `/play?t=<seconds>`. */
  seekable: z.boolean(),
});
export type VideoPlayback = z.infer<typeof VideoPlayback>;

/** `GET /api/library/videos/:id/play` query: where the remuxed stream starts, in seconds. */
export const PlayQuery = z.object({
  t: z.coerce.number().min(0).max(1_000_000).default(0),
});
export type PlayQuery = z.infer<typeof PlayQuery>;

/** Where a subtitle track comes from: a `.<lang>.vtt|srt` file next to the video, or the file. */
export const SUBTITLE_KINDS = ['sidecar', 'embedded'] as const;
export const SubtitleKind = z.enum(SUBTITLE_KINDS);
export type SubtitleKind = z.infer<typeof SubtitleKind>;

/** One entry of `GET /api/library/videos/:id/subtitles`: sidecars first, then embedded. */
export const SubtitleTrack = z.object({
  /** Language code as stored (`en`, `pt-BR`; embedded ISO 639-2 codes become `en`), or `und`. */
  lang: z.string(),
  /** `English`, `Portuguese (Brazil)`; the track's title when it has no language. */
  label: z.string(),
  kind: SubtitleKind,
  /** The WebVTT (`/api/library/videos/:id/subtitles/<index>.vtt`). */
  url: z.string(),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;

/** The URL of a video's subtitle track as WebVTT. */
export function subtitleTrackUrl(videoId: number, index: number): string {
  return `/api/library/videos/${videoId}/subtitles/${index}.vtt`;
}
