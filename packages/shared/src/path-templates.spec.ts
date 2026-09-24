import { describe, expect, it } from 'vitest';
import { MUSIC_PATH_TAGS, VIDEO_PATH_TAGS, validatePathTemplate } from './path-templates.js';
import { DEFAULT_SETTINGS, Settings, SettingsPatch } from './settings.js';

describe('validatePathTemplate', () => {
  it('accepts the defaults and every listed tag', () => {
    expect(validatePathTemplate(DEFAULT_SETTINGS.music.pathTemplate, MUSIC_PATH_TAGS)).toEqual({
      unknownTags: [],
      errors: [],
    });
    expect(
      validatePathTemplate(DEFAULT_SETTINGS.video.pathTemplate, VIDEO_PATH_TAGS).errors,
    ).toEqual([]);
    const allMusic = MUSIC_PATH_TAGS.map((t) => `{${t.tag}}`).join('/');
    expect(validatePathTemplate(allMusic, MUSIC_PATH_TAGS).errors).toEqual([]);
    expect(
      validatePathTemplate(
        '{artist}/{year} {album}/{disc:02}-{track:02} {title} [{id}]',
        MUSIC_PATH_TAGS,
      ).errors,
    ).toEqual([]);
    expect(
      validatePathTemplate('{channel}/{playlist}/{date} {title} [{id}]', VIDEO_PATH_TAGS).errors,
    ).toEqual([]);
  });

  it('lists unknown tags and unknown modifiers', () => {
    const check = validatePathTemplate('{artist}/{bogus}/{track:3} {bogus}', MUSIC_PATH_TAGS);
    expect(check.unknownTags).toEqual(['{bogus}', '{track:3}']);
    expect(check.errors[0]).toBe('Unknown tags {bogus}, {track:3}.');
  });

  it('keeps tags per library', () => {
    expect(validatePathTemplate('{channel}/{title}', MUSIC_PATH_TAGS).unknownTags).toEqual([
      '{channel}',
    ]);
    expect(validatePathTemplate('{artist}/{title}', VIDEO_PATH_TAGS).unknownTags).toEqual([
      '{artist}',
    ]);
  });

  it('rejects the :02 modifier on a text tag', () => {
    const check = validatePathTemplate('{artist}/{title:02}', MUSIC_PATH_TAGS);
    expect(check.unknownTags).toEqual([]);
    expect(check.errors).toEqual([':02 only pads numbers, not {title:02}.']);
  });

  it('rejects .. folders, absolute paths and unmatched braces', () => {
    expect(validatePathTemplate('{artist}/../{title}', MUSIC_PATH_TAGS).errors).toEqual([
      'Folders named .. are not allowed.',
    ]);
    expect(validatePathTemplate('/music/{title}', MUSIC_PATH_TAGS).errors).toEqual([
      'Use a path relative to the library folder, without a leading /.',
    ]);
    expect(validatePathTemplate('C:\\{title}', MUSIC_PATH_TAGS).errors).toHaveLength(1);
    expect(validatePathTemplate('{artist/{title}', MUSIC_PATH_TAGS).errors).toContain(
      'Unmatched { or }.',
    );
    // A dot inside a name is fine.
    expect(validatePathTemplate('{artist}/..{title}', MUSIC_PATH_TAGS).errors).toEqual([]);
  });
});

describe('pathTemplate settings', () => {
  it('rejects an unknown tag in a patch with a message naming it', () => {
    const result = SettingsPatch.safeParse({ music: { pathTemplate: '{artist}/{bogus}' } });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('{bogus}');
  });

  it('accepts a valid template', () => {
    expect(
      Settings.parse({ video: { pathTemplate: '{channel}/{date} {title}' } }).video.pathTemplate,
    ).toBe('{channel}/{date} {title}');
  });
});
