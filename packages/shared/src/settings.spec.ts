import { describe, expect, it } from 'vitest';
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
        downloadFullAlbums: true,
        embedCoverArt: true,
        skipLiveRecordings: false,
      },
      video: {
        pathTemplate: '{channel}/{title} ({date})',
        quality: '1080p',
        container: 'mkv',
        subtitleLanguages: ['en', 'nl'],
        subtitlesEmbedded: true,
        keepDays: 90,
        skipShorts: true,
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
    expect(SettingsPatch.parse({ network: { proxy: null }, video: { keepDays: 30 } })).toEqual({
      network: { proxy: null },
      video: { keepDays: 30 },
    });
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
  });
});

describe('settingsKey', () => {
  it('joins group and field with a dot', () => {
    expect(settingsKey('general', 'theme')).toBe('general.theme');
  });
});
