import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_MATCHER, DEFAULT_VIDEO_MATCHER } from './matchers.js';
import {
  DEFAULT_METADATA_PROVIDERS,
  DEFAULT_SETTINGS,
  SUBTITLE_LANGUAGES,
  Settings,
  SettingsPatch,
  SubtitleLanguageCode,
  settingsKey,
} from './settings.js';

describe('Settings', () => {
  it('fills every field with its default', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      general: { theme: 'system', checkIntervalHours: 2, downloadsAtOnce: 2 },
      music: {
        pathTemplate: '{artist}/{album}/{track:02} {title}',
        audioQuality: 'best',
        container: 'm4a',
        loudnessNormalization: false,
        embedCoverArt: true,
        defaultRules: DEFAULT_MUSIC_MATCHER,
        metadataProviders: {
          musicbrainz: { enabled: false },
          discogs: { enabled: false, token: null },
        },
      },
      video: {
        pathTemplate: '{channel}/{title} ({date})',
        quality: 'best',
        container: 'mp4',
        subtitleLanguages: ['en', 'nl'],
        subtitlesEmbedded: true,
        autoSubtitles: true,
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

/** Whether a patch of only `music.metadataProviders` is accepted. */
const patch = (metadataProviders: unknown) =>
  SettingsPatch.safeParse({ music: { metadataProviders } }).success;

describe('music.metadataProviders', () => {
  const providers = {
    musicbrainz: { enabled: true },
    discogs: { enabled: true, token: ' abcDEF123 ' },
  };

  it('is both providers off and no token by default', () => {
    expect(DEFAULT_SETTINGS.music.metadataProviders).toEqual(DEFAULT_METADATA_PROVIDERS);
  });

  it('patches as one value with both providers, trimming the token', () => {
    expect(SettingsPatch.parse({ music: { metadataProviders: providers } })).toEqual({
      music: {
        metadataProviders: {
          musicbrainz: { enabled: true },
          discogs: { enabled: true, token: 'abcDEF123' },
        },
      },
    });
  });

  it('rejects a partial value and empty tokens or tokens with spaces', () => {
    expect(patch({ musicbrainz: { enabled: true } })).toBe(false);
    expect(patch({ ...providers, discogs: { enabled: true, token: 'a b' } })).toBe(false);
    expect(patch({ ...providers, discogs: { enabled: true, token: '' } })).toBe(false);
    expect(patch({ ...providers, discogs: { enabled: true, token: null } })).toBe(true);
  });
});

describe('video subtitles', () => {
  it('turns generated subtitles on for an install that never stored the field', () => {
    // A stored group without the new field (an install from before it existed).
    const stored = Settings.parse({
      video: { subtitleLanguages: ['en'], subtitlesEmbedded: false },
    });
    expect(stored.video.autoSubtitles).toBe(true);
    expect(SettingsPatch.parse({ video: { autoSubtitles: false } })).toEqual({
      video: { autoSubtitles: false },
    });
    expect(SettingsPatch.safeParse({ video: { autoSubtitles: 'yes' } }).success).toBe(false);
  });

  it('keeps the picked order and accepts codes outside the list', () => {
    expect(
      SettingsPatch.parse({ video: { subtitleLanguages: ['nl', 'en-US', 'zh-Hans'] } }),
    ).toEqual({ video: { subtitleLanguages: ['nl', 'en-US', 'zh-Hans'] } });
    expect(SettingsPatch.safeParse({ video: { subtitleLanguages: ['English'] } }).success).toBe(
      false,
    );
  });

  it('offers valid, unique codes with names, English and Dutch first', () => {
    const codes = SUBTITLE_LANGUAGES.map((language) => language.code);
    expect(codes.slice(0, 2)).toEqual(['en', 'nl']);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.length).toBeGreaterThanOrEqual(40);
    for (const { code, name } of SUBTITLE_LANGUAGES) {
      expect(SubtitleLanguageCode.parse(code)).toBe(code);
      expect(name).not.toBe('');
    }
  });
});

describe('settingsKey', () => {
  it('joins group and field with a dot', () => {
    expect(settingsKey('general', 'theme')).toBe('general.theme');
  });
});
