import type { MusicSettings } from '@mytube/shared';

type Container = MusicSettings['container'];

/**
 * Loudness normalization: EBU R128 to -14 LUFS (what the streaming services play at), true
 * peak -1 dB. `loudnorm` upsamples to 192 kHz internally, so the output rate is set back to
 * 48 kHz.
 */
export const LOUDNORM_FILTER = 'loudnorm=I=-14:TP=-1:LRA=11';

/**
 * yt-dlp format selector for Settings → Music → Container and Loudness normalization.
 *
 * Without normalization the stream that already fits the container is preferred, so yt-dlp
 * only remuxes (AAC for m4a, Opus for opus). With normalization the audio has to be re-encoded
 * for the filter to run, and yt-dlp skips the conversion when the codec already matches, so the
 * other stream is preferred instead. mp3 and flac are always encoded (YouTube serves neither).
 */
export function audioFormat(container: Container, loudnessNormalization: boolean): string {
  const aac = 'bestaudio[ext=m4a]';
  const opus = 'bestaudio[acodec^=opus]';
  if (container === 'm4a') return `${loudnessNormalization ? opus : aac}/bestaudio/best`;
  if (container === 'opus') return `${loudnessNormalization ? aac : opus}/bestaudio/best`;
  return 'bestaudio/best';
}

/**
 * Extra yt-dlp flags from Settings → Music: extract the audio (`-x`) into the container
 * (`--audio-format`) at the quality (`--audio-quality`: `0` is the best VBR, else a bitrate;
 * flac is lossless and takes none), and with loudness normalization the ffmpeg filter for the
 * extraction (`--postprocessor-args ExtractAudio+ffmpeg_o:-af loudnorm=…`).
 */
export function musicExtraArgs(music: MusicSettings): string[] {
  const args = ['-x', '--audio-format', music.container];
  if (music.container !== 'flac') {
    args.push('--audio-quality', music.audioQuality === 'best' ? '0' : music.audioQuality);
  }
  if (music.loudnessNormalization) {
    args.push('--postprocessor-args', `ExtractAudio+ffmpeg_o:-af ${LOUDNORM_FILTER} -ar 48000`);
  }
  return args;
}
