import { SUBTITLE_LANGUAGES, SubtitleLanguageCode } from '@mytube/shared';

/** One row of the language list: a code, its English name, `custom` for a typed code. */
export interface LanguageOption {
  code: string;
  name: string;
  custom?: boolean;
}

let displayNames: Intl.DisplayNames | null | undefined;

/**
 * The English name of a code: from `SUBTITLE_LANGUAGES`, else from the browser's
 * `Intl.DisplayNames` (`en-US` → "American English"), else empty.
 */
export function languageName(code: string): string {
  const known = SUBTITLE_LANGUAGES.find((language) => language.code === code);
  if (known) return known.name;
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(code) ?? '';
  } catch {
    // A code Intl does not accept as a tag.
    return '';
  }
}

/** `codes` with `code` added at the end (selection order is `--sub-langs` order). */
export function withLanguage(codes: readonly string[], code: string): string[] {
  return codes.includes(code) ? [...codes] : [...codes, code];
}

/** `codes` without `code`, the rest in their order. */
export function withoutLanguage(codes: readonly string[], code: string): string[] {
  return codes.filter((other) => other !== code);
}

/**
 * The list under the filter: languages not picked yet whose code starts with the query or whose
 * name contains it (case-insensitive), an exact code first. A query that is a valid code not in
 * the list is offered as a `custom` row at the end.
 */
export function languageOptions(query: string, selected: readonly string[]): LanguageOption[] {
  const q = query.trim();
  const lower = q.toLowerCase();
  const matches = SUBTITLE_LANGUAGES.filter(
    ({ code, name }) =>
      !selected.includes(code) &&
      (code.toLowerCase().startsWith(lower) || name.toLowerCase().includes(lower)),
  ).map(({ code, name }): LanguageOption => ({ code, name }));
  const exact = matches.findIndex((option) => option.code.toLowerCase() === lower);
  if (exact > 0) matches.unshift(...matches.splice(exact, 1));
  const listed = SUBTITLE_LANGUAGES.some((language) => language.code.toLowerCase() === lower);
  if (q !== '' && !listed && !selected.includes(q) && SubtitleLanguageCode.safeParse(q).success) {
    const name = languageName(q);
    // `por` or `ger` name a listed language (a three-letter code); the list already has it.
    const same = name !== '' && SUBTITLE_LANGUAGES.some((language) => language.name === name);
    if (!same) matches.push({ code: q, name, custom: true });
  }
  return matches;
}

/** What a key in the filter does. */
export type LanguageKeyAction =
  | { type: 'highlight'; index: number }
  | { type: 'add'; code: string }
  | { type: 'removeLast' }
  | { type: 'close' };

/**
 * Keys in the filter: ↑ ↓ move the highlight (wrapping), Enter adds the highlighted row,
 * Backspace in an empty filter removes the last language, Escape closes. Anything else is left
 * to the input (undefined).
 */
export function languageKeyAction(
  key: string,
  state: { query: string; highlighted: number; options: readonly LanguageOption[] },
): LanguageKeyAction | undefined {
  const count = state.options.length;
  switch (key) {
    case 'ArrowDown':
      return count > 0 ? { type: 'highlight', index: (state.highlighted + 1) % count } : undefined;
    case 'ArrowUp':
      return count > 0
        ? { type: 'highlight', index: (state.highlighted - 1 + count) % count }
        : undefined;
    case 'Enter': {
      const option = state.options[state.highlighted];
      return option ? { type: 'add', code: option.code } : undefined;
    }
    case 'Backspace':
      return state.query === '' ? { type: 'removeLast' } : undefined;
    case 'Escape':
      return { type: 'close' };
    default:
      return undefined;
  }
}
