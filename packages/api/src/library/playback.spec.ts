import { describe, expect, it } from 'vitest';
import {
  languageLabel,
  normalizeLang,
  parseProbe,
  playbackMode,
  remuxArgs,
  sidecarSubtitles,
  subtitleArgs,
} from './playback.js';

const probe = (videoCodec: string | null, audioCodec: string | null) => ({
  videoCodec,
  audioCodec,
  width: null,
  height: null,
  durationSeconds: null,
  subtitles: [],
});

describe('playback helpers', () => {
  it('reads ffprobe output', () => {
    expect(
      parseProbe({
        streams: [
          { codec_type: 'video', codec_name: 'png', disposition: { attached_pic: 1 } },
          { codec_type: 'video', codec_name: 'vp9', width: 1920, height: 1080 },
          { codec_type: 'audio', codec_name: 'opus' },
          { codec_type: 'subtitle', codec_name: 'ass', tags: { LANGUAGE: 'ger', TITLE: 'x' } },
        ],
        format: { duration: '12.3' },
      }),
    ).toEqual({
      videoCodec: 'vp9',
      audioCodec: 'opus',
      width: 1920,
      height: 1080,
      durationSeconds: 12.3,
      subtitles: [{ n: 0, codec: 'ass', lang: 'ger', title: 'x' }],
    });
    expect(parseProbe({ streams: [] })).toMatchObject({ videoCodec: null, durationSeconds: null });
  });

  it('decides the playback mode by container and codecs', () => {
    expect(playbackMode('a.mp4', null)).toBe('direct');
    expect(playbackMode('a.WEBM', null)).toBe('direct');
    expect(playbackMode('a.mkv', probe('h264', 'aac'))).toBe('remux');
    expect(playbackMode('a.mkv', probe('av1', 'opus'))).toBe('remux');
    expect(playbackMode('a.mkv', probe('h264', null))).toBe('remux');
    expect(playbackMode('a.mkv', probe('hevc', 'aac'))).toBe('unsupported');
    expect(playbackMode('a.mkv', probe('h264', 'ac3'))).toBe('unsupported');
    expect(playbackMode('a.mkv', null)).toBe('unsupported');
    expect(playbackMode('a.mov', probe('h264', 'aac'))).toBe('unsupported');
  });

  it('seeks the remux only past the start', () => {
    expect(remuxArgs('/v/a.mkv', 0)).not.toContain('-ss');
    expect(remuxArgs('/v/a.mkv', 7.25).slice(4, 8)).toEqual(['-ss', '7.25', '-i', '/v/a.mkv']);
    expect(subtitleArgs('/v/a.mkv', '/c/1.vtt', 2)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      '/v/a.mkv',
      '-map',
      '0:s:2',
      '-f',
      'webvtt',
      '/c/1.vtt',
    ]);
  });

  it('finds the subtitle sidecars of one video', () => {
    expect(
      sidecarSubtitles('Talk (2026-09-01)', [
        'Talk (2026-09-01).mkv',
        'Talk (2026-09-01).nl.srt',
        'Talk (2026-09-01).en.vtt',
        'Talk (2026-09-01).pt-BR.vtt',
        'Talk (2026-09-01).jpg',
        'Talk (2026-09-01) 2.en.vtt',
        'Talk (2026-09-01).en.ass',
      ]),
    ).toEqual([
      { file: 'Talk (2026-09-01).en.vtt', lang: 'en', format: 'vtt' },
      { file: 'Talk (2026-09-01).nl.srt', lang: 'nl', format: 'srt' },
      { file: 'Talk (2026-09-01).pt-BR.vtt', lang: 'pt-BR', format: 'vtt' },
    ]);
  });

  it('names languages', () => {
    expect(normalizeLang('eng')).toBe('en');
    expect(normalizeLang('dut')).toBe('nl');
    expect(normalizeLang('pt-BR')).toBe('pt-BR');
    expect(normalizeLang(null)).toBe('und');
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('nl')).toBe('Dutch');
    expect(languageLabel('und')).toBe('Unknown language');
    expect(languageLabel('qq')).toBe('qq');
  });
});
