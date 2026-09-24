import { describe, expect, it } from 'vitest';
import { parseThemeChoice } from './theme';

describe('parseThemeChoice', () => {
  it('keeps explicit light and dark', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
  });

  it('falls back to system for anything else', () => {
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice('sepia')).toBe('system');
  });
});
