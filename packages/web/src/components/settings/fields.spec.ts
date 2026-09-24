import { describe, expect, it } from 'vitest';
import { valueInputChars } from '../ui/TextValueInput';
import { formatLanguageList, parseLanguageList, qualityLabel, textOrNull } from './fields';
import { validateMusicTemplate } from './MusicSettings';
import { validateNetworkField } from './NetworkCard';
import { validateLanguageList } from './VideoControls';

describe('settings field helpers', () => {
  it('maps an empty box to null and trims the rest', () => {
    expect(textOrNull('')).toBeNull();
    expect(textOrNull('   ')).toBeNull();
    expect(textOrNull(' 5M ')).toBe('5M');
  });

  it('round-trips subtitle language lists', () => {
    expect(parseLanguageList('en, nl')).toEqual(['en', 'nl']);
    expect(parseLanguageList(' en,,nl  pt-BR ')).toEqual(['en', 'nl', 'pt-BR']);
    expect(parseLanguageList('')).toEqual([]);
    expect(formatLanguageList(['en', 'nl'])).toBe('en, nl');
  });

  it('labels the best quality as in the handoff', () => {
    expect(qualityLabel('best')).toBe('best available');
    expect(qualityLabel('1080p')).toBe('1080p');
  });

  it('validates like the shared schema', () => {
    expect(validateNetworkField('rateLimit', '')).toBeUndefined();
    expect(validateNetworkField('rateLimit', '5M')).toBeUndefined();
    expect(validateNetworkField('rateLimit', 'fast')).toBe('Use a rate such as 500K or 5M');
    expect(validateNetworkField('proxy', 'socks5://host:1080')).toBeUndefined();
    expect(validateLanguageList('en, nl')).toBeUndefined();
    expect(validateLanguageList('')).toBeUndefined();
    expect(validateLanguageList('english')).toBe('Use a language code such as en or pt-BR');
    expect(validateMusicTemplate('')).toBe('Enter a folder structure.');
    expect(validateMusicTemplate('{artist}/{title}')).toBeUndefined();
    expect(validateMusicTemplate('{artist}/{bogus}')).toBe('Unknown tag {bogus}.');
    expect(validateMusicTemplate('../{title:02}')).toBe(
      ':02 only pads numbers, not {title:02}. Folders named .. are not allowed.',
    );
  });

  it('sizes a text value box to its text within bounds', () => {
    expect(valueInputChars('')).toBe(20);
    expect(valueInputChars('{artist}/{album}/{track:02} {title}')).toBe(37);
    expect(valueInputChars('x'.repeat(200))).toBe(56);
    expect(valueInputChars('', 'none')).toBe(20);
  });
});
