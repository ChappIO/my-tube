import type { SubtitleTrack } from '@mytube/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SPEEDS,
  activeTrackIndex,
  cycleCaptions,
  cycleSpeed,
  nextSpeed,
  nextTrackIndex,
  pickTrack,
  readVideoPrefs,
  resetVideoPrefs,
  setSubBg,
  setSubSize,
  speedLabel,
  toggleTheater,
  videoPrefs,
} from './video-prefs';

const track = (index: number, lang: string, kind: SubtitleTrack['kind']): SubtitleTrack => ({
  lang,
  label: lang,
  kind,
  url: `/api/library/videos/4/subtitles/${index}.vtt`,
});

const tracks = [track(0, 'en', 'sidecar'), track(1, 'nl', 'sidecar'), track(2, 'en', 'embedded')];

/** The track video 4 shows now. */
const shown = () => activeTrackIndex(tracks, 4, videoPrefs());

afterEach(() => {
  resetVideoPrefs();
  vi.unstubAllGlobals();
});

describe('speed', () => {
  it('cycles 1× → 1.25× → 1.5× → 2× → 0.75× → 1×', () => {
    const seen = [1];
    for (let step = 0; step < SPEEDS.length; step += 1) seen.push(nextSpeed(seen.at(-1)!));
    expect(seen).toEqual([1, 1.25, 1.5, 2, 0.75, 1]);
    expect(nextSpeed(3)).toBe(1);
    expect(speedLabel(1.25)).toBe('1.25×');
    cycleSpeed();
    cycleSpeed();
    expect(videoPrefs().speed).toBe(1.5);
  });
});

describe('captions', () => {
  it('cycles Off → each track in order → Off', () => {
    const order = [-1];
    for (let step = 0; step < 4; step += 1) {
      order.push(nextTrackIndex(tracks, order.at(-1)!));
    }
    expect(order).toEqual([-1, 0, 1, 2, -1]);
    expect(nextTrackIndex([], -1)).toBe(-1);
  });

  it('C walks through the tracks of the video, both English ones included', () => {
    expect(shown()).toBe(-1);
    const order: number[] = [];
    for (let step = 0; step < 4; step += 1) {
      cycleCaptions(tracks, 4);
      order.push(shown());
    }
    expect(order).toEqual([0, 1, 2, -1]);
  });

  it('a new video starts in the language chosen last, or Off', () => {
    pickTrack(tracks, 4, 1);
    expect(videoPrefs().subLang).toBe('nl');
    const other = [track(0, 'en', 'embedded'), track(1, 'nl', 'embedded')];
    expect(activeTrackIndex(other, 5, videoPrefs())).toBe(1);
    expect(activeTrackIndex([track(0, 'de', 'sidecar')], 6, videoPrefs())).toBe(-1);
    pickTrack(tracks, 4, -1);
    expect(videoPrefs().subLang).toBeNull();
    expect(activeTrackIndex(other, 5, videoPrefs())).toBe(-1);
  });
});

describe('persistence', () => {
  it('reads what was stored, field by field', () => {
    expect(readVideoPrefs(null)).toEqual({
      subLang: null,
      subSize: 'M',
      subBg: true,
      speed: 1,
      theater: false,
    });
    expect(readVideoPrefs('{"subLang":"nl","subSize":"XL","speed":3,"theater":true}')).toEqual({
      subLang: 'nl',
      subSize: 'M',
      subBg: true,
      speed: 1,
      theater: true,
    });
    expect(readVideoPrefs('not json')).toMatchObject({ subSize: 'M' });
  });

  it('stores the choices in localStorage and survives storage that refuses', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
    setSubSize('L');
    setSubBg(false);
    toggleTheater();
    expect(JSON.parse(store.get('mytube.player.video')!)).toEqual({
      subLang: null,
      subSize: 'L',
      subBg: false,
      speed: 1,
      theater: true,
    });

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => setSubSize('S')).not.toThrow();
    expect(videoPrefs().subSize).toBe('S');
  });
});
