import { extname } from 'node:path';
import {
  REMUX_AUDIO_CODECS,
  REMUX_VIDEO_CODECS,
  videoMimeType,
  type PlaybackMode,
  type VideoPlayback,
} from '@mytube/shared';
import { z } from 'zod';

/*
 * The pure part of video playback (backend skill "Playback"): reading ffprobe's answer, deciding
 * how `/play` serves a file, the ffmpeg arguments for the remux and the subtitle extraction, and
 * the subtitle sidecars next to a video.
 */

/** ffprobe's `-show_streams -show_format` JSON, only the fields we read. */
const ProbeJson = z.object({
  streams: z
    .array(
      z.object({
        codec_name: z.string().optional(),
        codec_type: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        disposition: z.object({ attached_pic: z.number().optional() }).partial().optional(),
        tags: z.record(z.string(), z.string()).optional(),
      }),
    )
    .default([]),
  format: z.object({ duration: z.string().optional() }).partial().default({}),
});

/** One subtitle stream of a file. `n` is its position among the subtitle streams (`0:s:<n>`). */
export interface ProbedSubtitle {
  n: number;
  codec: string | null;
  lang: string | null;
  title: string | null;
}

/** What ffprobe tells about a video file. */
export interface MediaProbe {
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  subtitles: ProbedSubtitle[];
}

function positive(value: number | undefined): number | null {
  return value !== undefined && value > 0 ? Math.round(value) : null;
}

/** Parses ffprobe's JSON. Cover art (an attached picture) is not the video stream. */
export function parseProbe(json: unknown): MediaProbe {
  const probe = ProbeJson.parse(json);
  const video = probe.streams.find(
    (stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic,
  );
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number.parseFloat(probe.format.duration ?? '');
  return {
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    width: positive(video?.width),
    height: positive(video?.height),
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    subtitles: probe.streams
      .filter((stream) => stream.codec_type === 'subtitle')
      .map((stream, n) => ({
        n,
        codec: stream.codec_name ?? null,
        lang: stream.tags?.language ?? stream.tags?.LANGUAGE ?? null,
        title: stream.tags?.title ?? stream.tags?.TITLE ?? null,
      })),
  };
}

/** Containers the browser plays as they are. */
const DIRECT_CONTAINERS = new Set(['.mp4', '.m4v', '.webm']);

/**
 * How `/play` serves a file: mp4 and webm directly; an mkv whose video and audio codecs play in
 * an mp4 (`REMUX_*_CODECS`; no audio is fine) is remuxed; everything else, and an mkv ffprobe
 * could not read, is unsupported.
 */
export function playbackMode(filePath: string, probe: MediaProbe | null): PlaybackMode {
  const ext = extname(filePath).toLowerCase();
  if (DIRECT_CONTAINERS.has(ext)) return 'direct';
  if (ext !== '.mkv' || !probe || !probe.videoCodec) return 'unsupported';
  const video = (REMUX_VIDEO_CODECS as readonly string[]).includes(probe.videoCodec);
  const audio =
    probe.audioCodec === null ||
    (REMUX_AUDIO_CODECS as readonly string[]).includes(probe.audioCodec);
  return video && audio ? 'remux' : 'unsupported';
}

/** The `GET /playback` answer for a file. */
export function describePlayback(filePath: string, probe: MediaProbe | null): VideoPlayback {
  const mode = playbackMode(filePath, probe);
  return {
    mode,
    mimeType: mode === 'remux' ? 'video/mp4' : videoMimeType(filePath),
    videoCodec: probe?.videoCodec ?? null,
    audioCodec: probe?.audioCodec ?? null,
    width: probe?.width ?? null,
    height: probe?.height ?? null,
    durationSeconds: probe?.durationSeconds ?? null,
    seekable: mode === 'direct',
  };
}

const QUIET = ['-hide_banner', '-nostdin', '-loglevel', 'error'];

/**
 * ffmpeg arguments that remux `file` from `start` seconds into a fragmented mp4 on stdout: the
 * first video and audio stream copied (no re-encode; subtitles and data left out, an mp4 cannot
 * carry them as they are), fragments at each keyframe with an empty `moov` up front so the
 * browser can play while it arrives. `-ss` before `-i` seeks the input to the keyframe at or
 * before `start`.
 */
export function remuxArgs(file: string, start: number): string[] {
  const seek = start > 0 ? ['-ss', String(start)] : [];
  return [
    ...QUIET,
    ...seek,
    '-i',
    file,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-sn',
    '-dn',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-f',
    'mp4',
    'pipe:1',
  ];
}

/**
 * ffmpeg arguments that write a subtitle as WebVTT to `output`: the `n`th subtitle stream of a
 * video, or (without `n`) a sidecar file's only stream.
 */
export function subtitleArgs(input: string, output: string, n?: number): string[] {
  const map = n === undefined ? [] : ['-map', `0:s:${n}`];
  return [...QUIET, '-y', '-i', input, ...map, '-f', 'webvtt', output];
}

/** Text subtitle codecs ffmpeg converts to WebVTT; bitmap subtitles (DVD, PGS) cannot be. */
export const TEXT_SUBTITLE_CODECS = new Set([
  'subrip',
  'srt',
  'webvtt',
  'mov_text',
  'ass',
  'ssa',
  'text',
]);

/** A subtitle file next to a video: `<stem>.<lang>.vtt|srt`. */
export interface SidecarSubtitle {
  file: string;
  lang: string;
  format: 'vtt' | 'srt';
}

const SIDECAR = /^\.([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\.(vtt|srt)$/;

/**
 * The subtitle sidecars of the video `<stem>.<ext>` among the file names of its folder, sorted by
 * language: `Talk (2026-09-01).en.vtt` is English for `Talk (2026-09-01).mkv`.
 */
export function sidecarSubtitles(stem: string, names: readonly string[]): SidecarSubtitle[] {
  const found: SidecarSubtitle[] = [];
  for (const file of names) {
    if (!file.startsWith(stem)) continue;
    const match = SIDECAR.exec(file.slice(stem.length));
    if (!match) continue;
    found.push({ file, lang: match[1]!, format: match[2] === 'srt' ? 'srt' : 'vtt' });
  }
  return found.toSorted((a, b) => a.lang.localeCompare(b.lang) || a.file.localeCompare(b.file));
}

/** ISO 639-2 codes ffmpeg and yt-dlp write into containers, mapped to the codes Settings uses. */
const ISO_639_2: Readonly<Record<string, string>> = {
  eng: 'en',
  nld: 'nl',
  dut: 'nl',
  deu: 'de',
  ger: 'de',
  fra: 'fr',
  fre: 'fr',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  jpn: 'ja',
  kor: 'ko',
  zho: 'zh',
  chi: 'zh',
  rus: 'ru',
  pol: 'pl',
  swe: 'sv',
  dan: 'da',
  nor: 'no',
  fin: 'fi',
  tur: 'tr',
  ara: 'ar',
  hin: 'hi',
  ukr: 'uk',
  ces: 'cs',
  cze: 'cs',
};

/** A container's language tag as the code Settings uses (`eng` → `en`); `und` without one. */
export function normalizeLang(lang: string | null): string {
  if (!lang) return 'und';
  const lower = lang.toLowerCase();
  return ISO_639_2[lower] ?? lang;
}

const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/** `en` → `English`, `pt-BR` → `Brazilian Portuguese`; the code itself when unknown. */
export function languageLabel(lang: string): string {
  if (lang === 'und') return 'Unknown language';
  try {
    return LANGUAGE_NAMES.of(lang) ?? lang;
  } catch {
    return lang;
  }
}
