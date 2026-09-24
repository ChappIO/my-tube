import { describe, expect, it } from 'vitest';
import * as icons from './icons';
import { ICON_REGISTRY, listIcons } from './icons';

const entries = Object.entries(ICON_REGISTRY);
const registryNames = Object.keys(ICON_REGISTRY).toSorted();

describe('icon registry', () => {
  it('uses every Lucide glyph for one icon only', () => {
    const byBase = new Map<unknown, string[]>();
    for (const [name, { base }] of entries) {
      byBase.set(base, [...(byBase.get(base) ?? []), name]);
    }
    const shared = [...byBase.values()].filter((names) => names.length > 1);
    expect(shared).toEqual([]);
  });

  it('gives every icon one distinct meaning', () => {
    const meanings = entries.map(([, { meaning }]) => meaning.toLowerCase());
    expect(new Set(meanings).size).toBe(meanings.length);
    for (const [, entry] of entries) {
      expect(entry.meaning).not.toBe('');
      expect(entry.usedIn).not.toBe('');
    }
  });

  it('exports exactly the registered icons (plus the non-Lucide BellIcon)', () => {
    const exported = Object.keys(icons)
      .filter((name) => name.endsWith('Icon') && name !== 'BellIcon')
      .toSorted();
    expect(exported).toEqual(registryNames);
  });

  it('builds each registered icon once, named after its registry key', () => {
    const built = listIcons();
    expect(built.map(([name]) => name).toSorted()).toEqual(registryNames);
    for (const [name, component] of built) expect(component.displayName).toBe(name);
  });
});
