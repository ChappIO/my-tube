import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  languageKeyAction,
  languageName,
  languageOptions,
  withLanguage,
  withoutLanguage,
} from './language-select';
import { LanguageMultiSelect, LanguagePopover } from './LanguageMultiSelect';
import { AutoSubtitlesRow } from './VideoControls';

/** The markup's text without tags. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const noop = () => {};

describe('language helpers', () => {
  it('names listed codes, falls back to Intl, and leaves unknown ones blank', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('zh-Hans')).toBe('Chinese (Simplified)');
    expect(languageName('en-US')).toBe('American English');
    expect(languageName('qqq')).toBe('');
  });

  it('adds at the end, once, and removes keeping the order', () => {
    expect(withLanguage(['nl'], 'en')).toEqual(['nl', 'en']);
    expect(withLanguage(['nl', 'en'], 'nl')).toEqual(['nl', 'en']);
    expect(withoutLanguage(['nl', 'en', 'de'], 'en')).toEqual(['nl', 'de']);
  });

  it('filters by code prefix or name, without picked ones, an exact code first', () => {
    const all = languageOptions('', ['en']);
    expect(all[0]).toEqual({ code: 'nl', name: 'Dutch' });
    expect(all.some((option) => option.code === 'en')).toBe(false);
    // "ger" is also a three-letter code for German, which the list already has.
    expect(languageOptions('ger', []).map((option) => option.code)).toEqual(['de']);
    expect(languageOptions('por', []).map((option) => option.code)).toEqual(['pt', 'pt-BR']);
    // `pt` is a code; `pt-BR` starts with it; "Portuguese" names both.
    expect(languageOptions('PT', []).map((option) => option.code)).toEqual(['pt', 'pt-BR']);
    // "no" is Norwegian's code and inside other names; the exact code comes first.
    expect(languageOptions('no', [])[0]?.code).toBe('no');
  });

  it('offers a typed code outside the list, and nothing for text that is no code', () => {
    expect(languageOptions('en-US', [])).toEqual([
      { code: 'en-US', name: 'American English', custom: true },
    ]);
    expect(languageOptions('en-US', ['en-US'])).toEqual([]);
    expect(languageOptions('xx yy', [])).toEqual([]);
    expect(languageOptions('yue', [])).toEqual([{ code: 'yue', name: 'Cantonese', custom: true }]);
    // A listed code is never offered twice.
    expect(languageOptions('nl', []).filter((option) => option.custom)).toEqual([]);
  });

  it('maps keys: arrows wrap, Enter adds, Backspace removes only from an empty filter', () => {
    const options = languageOptions('', []);
    const state = { query: '', highlighted: 0, options };
    expect(languageKeyAction('ArrowDown', state)).toEqual({ type: 'highlight', index: 1 });
    expect(languageKeyAction('ArrowUp', state)).toEqual({
      type: 'highlight',
      index: options.length - 1,
    });
    expect(languageKeyAction('Enter', { ...state, highlighted: 1 })).toEqual({
      type: 'add',
      code: 'nl',
    });
    expect(languageKeyAction('Backspace', state)).toEqual({ type: 'removeLast' });
    expect(languageKeyAction('Backspace', { ...state, query: 'd' })).toBeUndefined();
    expect(languageKeyAction('Escape', state)).toEqual({ type: 'close' });
    expect(languageKeyAction('Enter', { query: 'xx yy', highlighted: 0, options: [] })).toBe(
      undefined,
    );
    expect(languageKeyAction('a', state)).toBeUndefined();
  });
});

describe('LanguageMultiSelect', () => {
  it('renders a chip per code, in order, with code, name and a remove button', () => {
    const html = renderToStaticMarkup(
      <LanguageMultiSelect value={['nl', 'en', 'en-US']} onChange={noop} />,
    );
    expect(text(html)).toBe('nl Dutch en English en-US American English Add language');
    expect(html).toContain('aria-label="Remove Dutch"');
    expect(html).toContain('aria-label="Remove American English"');
    expect(html).toMatch(/aria-label="Add language" aria-haspopup="listbox" aria-expanded="false"/);
  });

  it('shows none without languages', () => {
    const html = renderToStaticMarkup(<LanguageMultiSelect value={[]} onChange={noop} />);
    expect(text(html)).toBe('none Add language');
  });

  it('lists the languages not picked yet in the popover', () => {
    const html = renderToStaticMarkup(
      <LanguagePopover selected={['en', 'nl']} onAdd={noop} onRemoveLast={noop} onClose={noop} />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(text(html)).toMatch(/^German de French fr Spanish es/);
    expect(text(html)).not.toContain('Dutch');
    // The first row is highlighted, for Enter.
    expect(html).toMatch(/role="option" aria-selected="true"[^>]*>.*?German/);
  });
});

describe('AutoSubtitlesRow', () => {
  it('renders the toggle with its hint, on or off', () => {
    const on = renderToStaticMarkup(<AutoSubtitlesRow checked onChange={noop} />);
    expect(text(on)).toBe(
      'Download generated subtitles YouTube&#x27;s automatic captions, for languages without uploaded subtitles. Machine translations are skipped.',
    );
    expect(on).toContain('role="switch" aria-checked="true"');
    const off = renderToStaticMarkup(<AutoSubtitlesRow checked={false} disabled onChange={noop} />);
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('disabled=""');
  });
});
