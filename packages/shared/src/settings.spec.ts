import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_MATCHER, DEFAULT_VIDEO_MATCHER } from './matchers.js';
import { DEFAULT_SETTINGS, Settings, SettingsPatch, settingsKey } from './settings.js';

describe('Settings', () => {
  it('fills every field from the handoff defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      general: { theme: 'system', checkIntervalHours: 2, downloadsAtOnce: 2 },
      music: {
        pathTemplate: '{artist}/{album}/{track:02} {title}',
        audioQuality: 'best',
        container: 'm4a',
        loudnessNormalization: false,
        embedCoverArt: true,
        defaultRules: DEFAULT_MUSIC_MATCHER,
      },
      video: {
        pathTemplate: '{channel}/{title} ({date})',
        quality: '1080p',
        container: 'mkv',
        subtitleLanguages: ['en', 'nl'],
        subtitlesEmbedded: true,
        defaultRules: DEFAULT_VIDEO_MATCHER,
        saveThumbnails: true,
      },
      ytdlp: { autoUpdate: true, updateIntervalHours: 6 },
      network: { rateLimit: null, proxy: null, cookiesFile: null },
      data: { logLevel: 'info' },
    });
  });

  it('fills missing fields of a partial group and strips unknown keys', () => {
    const parsed = Settings.parse({ general: { theme: 'dark', stale: 1 }, gone: {} });
    expect(parsed.general).toEqual({ theme: 'dark', checkIntervalHours: 2, downloadsAtOnce: 2 });
    expect(parsed).not.toHaveProperty('gone');
  });
});

describe('SettingsPatch', () => {
  it('keeps only the given fields, without defaults', () => {
    expect(SettingsPatch.parse({ general: { theme: 'dark' } })).toEqual({
      general: { theme: 'dark' },
    });
    const rules = { type: 'and', items: [{ type: 'is_short' }] };
    expect(
      SettingsPatch.parse({ network: { proxy: null }, video: { defaultRules: rules } }),
    ).toEqual({ network: { proxy: null }, video: { defaultRules: rules } });
  });

  it('rejects empty patches, unknown keys and invalid values', () => {
    expect(SettingsPatch.safeParse({}).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: {} }).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: { nope: 1 } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ nope: { theme: 'dark' } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: { checkIntervalHours: 3 } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: { downloadsAtOnce: 6 } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: { downloadsAtOnce: 1.5 } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ general: { theme: 'sepia' } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ video: { keepDays: 30 } }).success).toBe(false);
    expect(SettingsPatch.safeParse({ video: { defaultRules: { type: 'x' } } }).success).toBe(false);
    expect(
      SettingsPatch.safeParse({
        video: { defaultRules: { type: 'channel_is', channel: 'NASA' } },
      }).success,
    ).toBe(false);
  });
});

describe('settingsKey', () => {
  it('joins group and field with a dot', () => {
    expect(settingsKey('general', 'theme')).toBe('general.theme');
  });
});
