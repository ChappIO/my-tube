import { DEFAULT_SETTINGS } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { applySettingsPatch } from './settings';

describe('applySettingsPatch', () => {
  it('changes only the patched fields', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      general: { theme: 'dark' },
      network: { proxy: 'http://proxy:3128' },
    });
    expect(next.general).toEqual({ ...DEFAULT_SETTINGS.general, theme: 'dark' });
    expect(next.network).toEqual({ ...DEFAULT_SETTINGS.network, proxy: 'http://proxy:3128' });
    expect(next.music).toEqual(DEFAULT_SETTINGS.music);
  });

  it('keeps null values and skips undefined ones', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      video: { keepDays: null, quality: undefined },
    });
    expect(next.video.keepDays).toBeNull();
    expect(next.video.quality).toBe(DEFAULT_SETTINGS.video.quality);
  });

  it('does not mutate the input', () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    applySettingsPatch(DEFAULT_SETTINGS, { general: { downloadsAtOnce: 5 } });
    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});
