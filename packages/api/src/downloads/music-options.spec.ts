import { DEFAULT_SETTINGS } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { audioFormat, musicExtraArgs } from './music-options.js';

describe('music download options', () => {
  it('prefers the stream that fits the container, and the other one to normalize', () => {
    expect(audioFormat('m4a', false)).toBe('bestaudio[ext=m4a]/bestaudio/best');
    expect(audioFormat('m4a', true)).toBe('bestaudio[acodec^=opus]/bestaudio/best');
    expect(audioFormat('opus', false)).toBe('bestaudio[acodec^=opus]/bestaudio/best');
    expect(audioFormat('opus', true)).toBe('bestaudio[ext=m4a]/bestaudio/best');
    expect(audioFormat('mp3', true)).toBe('bestaudio/best');
  });

  it('extracts the audio at the chosen quality, with loudnorm when asked', () => {
    const music = DEFAULT_SETTINGS.music;
    expect(musicExtraArgs(music)).toEqual(['-x', '--audio-format', 'm4a', '--audio-quality', '0']);
    expect(musicExtraArgs({ ...music, container: 'flac' })).toEqual([
      '-x',
      '--audio-format',
      'flac',
    ]);
    expect(musicExtraArgs({ ...music, audioQuality: '192k', loudnessNormalization: true })).toEqual(
      [
        '-x',
        '--audio-format',
        'm4a',
        '--audio-quality',
        '192k',
        '--postprocessor-args',
        'ExtractAudio+ffmpeg_o:-af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000',
      ],
    );
  });
});
