import { describe, expect, it } from 'vitest';
import { embedArgs, iso6392, subtitleCodec } from './embed.js';

describe('embedArgs', () => {
  it('copies every stream, adds the sidecars in the container codec and tags their language', () => {
    expect(
      embedArgs(
        '/v/Video.mp4',
        '/v/.Video.subtitles.mp4',
        [
          { file: '/v/Video.en.vtt', lang: 'en' },
          { file: '/v/Video.yue.vtt', lang: 'yue' },
        ],
        1,
      ),
    ).toEqual([
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      '/v/Video.mp4',
      '-i',
      '/v/Video.en.vtt',
      '-i',
      '/v/Video.yue.vtt',
      '-map',
      '0',
      '-map',
      '1',
      '-map',
      '2',
      '-c',
      'copy',
      '-c:s',
      'mov_text',
      '-metadata:s:s:1',
      'language=eng',
      '-metadata:s:s:1',
      'title=en',
      '-metadata:s:s:2',
      'title=yue',
      '/v/.Video.subtitles.mp4',
    ]);
  });

  it('picks the text codec by container and the ISO 639-2 tag by base language', () => {
    expect(subtitleCodec('.mp4')).toBe('mov_text');
    expect(subtitleCodec('m4v')).toBe('mov_text');
    expect(subtitleCodec('.webm')).toBe('webvtt');
    expect(subtitleCodec('.mkv')).toBe('srt');
    expect(iso6392('en-US')).toBe('eng');
    expect(iso6392('nl')).toBe('nld');
    expect(iso6392('pt-BR')).toBe('por');
    expect(iso6392('yue')).toBeNull();
  });
});
