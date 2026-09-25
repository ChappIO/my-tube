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
      network: { cookiesFile: '/config/cookies.txt' },
    });
    const cleared = applySettingsPatch(next, { network: { cookiesFile: null, proxy: undefined } });
    expect(cleared.network.cookiesFile).toBeNull();
    expect(cleared.network.proxy).toBe(DEFAULT_SETTINGS.network.proxy);
  });

  it('does not mutate the input', () => {
    const before = structuredClone(DEFAULT_SETTINGS);
    applySettingsPatch(DEFAULT_SETTINGS, { general: { downloadsAtOnce: 5 } });
    expect(DEFAULT_SETTINGS).toEqual(before);
  });
});
