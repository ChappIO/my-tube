import { describe, expect, it } from 'vitest';
import { parseWholeNumber } from './NumberInput';

describe('parseWholeNumber', () => {
  it('accepts whole numbers within bounds', () => {
    expect(parseWholeNumber('1', 1, 5)).toBe(1);
    expect(parseWholeNumber(' 5 ', 1, 5)).toBe(5);
  });

  it('rejects empty, fractional, non-numeric and out-of-range text', () => {
    for (const text of ['', ' ', '2.5', '1e1', 'abc', '0', '6', '-1']) {
      expect(parseWholeNumber(text, 1, 5)).toBeUndefined();
    }
  });
});
