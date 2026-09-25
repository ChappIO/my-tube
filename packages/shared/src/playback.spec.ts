import { describe, expect, it } from 'vitest';
import { PlayQuery, VideoPlayback, subtitleTrackUrl } from './playback.js';

describe('playback contract', () => {
  it('parses the start offset of /play', () => {
    expect(PlayQuery.parse({})).toEqual({ t: 0 });
    expect(PlayQuery.parse({ t: '12.5' })).toEqual({ t: 12.5 });
    expect(PlayQuery.safeParse({ t: '-1' }).success).toBe(false);
    expect(PlayQuery.safeParse({ t: 'soon' }).success).toBe(false);
  });

  it('describes a playback', () => {
    const remux = {
      mode: 'remux',
      mimeType: 'video/mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 854,
      height: 480,
      durationSeconds: 61.2,
      seekable: false,
    };
    expect(VideoPlayback.parse(remux)).toEqual(remux);
    expect(VideoPlayback.safeParse({ ...remux, mode: 'transcode' }).success).toBe(false);
  });

  it('builds subtitle URLs', () => {
    expect(subtitleTrackUrl(4, 0)).toBe('/api/library/videos/4/subtitles/0.vtt');
  });
});
