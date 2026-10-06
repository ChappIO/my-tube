import { describe, expect, it } from 'vitest';
import { valueInputChars } from '../ui/TextValueInput';
import { codecLabel, codecNote, qualityLabel, textOrNull } from './fields';
import { discogsNote, validateDiscogsToken } from './MetadataProvidersCard';
import { validateMusicTemplate } from './MusicSettings';
import { validateNetworkField } from './NetworkCard';

describe('settings field helpers', () => {
  it('maps an empty box to null and trims the rest', () => {
    expect(textOrNull('')).toBeNull();
    expect(textOrNull('   ')).toBeNull();
    expect(textOrNull(' 5M ')).toBe('5M');
  });

  it('labels the best quality "best available"', () => {
    expect(qualityLabel('best')).toBe('best available');
    expect(qualityLabel('1080p')).toBe('1080p');
  });

  it('labels the codec by what it is for and explains it in plain words', () => {
    expect(codecLabel('compatible')).toBe('plays everywhere');
    expect(codecLabel('efficient')).toBe('smallest files');
    expect(codecNote('compatible')).toMatch(/^H\.264 up to 1080p, VP9 above it/);
    expect(codecNote('efficient')).toMatch(/^AV1 wherever YouTube has it/);
  });

  it('validates like the shared schema', () => {
    expect(validateNetworkField('rateLimit', '')).toBeUndefined();
    expect(validateNetworkField('rateLimit', '5M')).toBeUndefined();
    expect(validateNetworkField('rateLimit', 'fast')).toBe('Use a rate such as 500K or 5M');
    expect(validateNetworkField('proxy', 'socks5://host:1080')).toBeUndefined();
    expect(validateMusicTemplate('')).toBe('Enter a folder structure.');
    expect(validateMusicTemplate('{artist}/{title}')).toBeUndefined();
    expect(validateMusicTemplate('{artist}/{bogus}')).toBe('Unknown tag {bogus}.');
    expect(validateMusicTemplate('../{title:02}')).toBe(
      ':02 only pads numbers, not {title:02}. Folders named .. are not allowed.',
    );
  });

  it('validates the Discogs token and notes a Discogs toggle without one', () => {
    expect(validateDiscogsToken('')).toBeUndefined();
    expect(validateDiscogsToken('abcDEF123')).toBeUndefined();
    expect(validateDiscogsToken('abc def')).toBe('A token has no spaces.');
    const off = { musicbrainz: { enabled: false }, discogs: { enabled: false, token: null } };
    expect(discogsNote(off)).toBeUndefined();
    expect(discogsNote({ ...off, discogs: { enabled: true, token: null } })).toBe(
      'Discogs is skipped until a token is set.',
    );
    expect(discogsNote({ ...off, discogs: { enabled: true, token: 'abc' } })).toBeUndefined();
  });

  it('sizes a text value box to its text within bounds', () => {
    expect(valueInputChars('')).toBe(20);
    expect(valueInputChars('{artist}/{album}/{track:02} {title}')).toBe(37);
    expect(valueInputChars('x'.repeat(200))).toBe(56);
    expect(valueInputChars('', 'none')).toBe(20);
  });
});
