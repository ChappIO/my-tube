import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins truthy class names with single spaces', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops false, null, undefined, 0 and empty strings', () => {
    expect(cx('a', false, null, undefined, 0, '', 'b')).toBe('a b');
  });

  it('supports conditional classes', () => {
    const active = true;
    const disabled = false;
    expect(cx('pill', active && 'bg-bg', disabled && 'opacity-50')).toBe('pill bg-bg');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cx(false, undefined)).toBe('');
  });
});
