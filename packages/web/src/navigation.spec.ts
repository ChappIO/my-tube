import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MUSIC_TAB,
  DEFAULT_SETTINGS_TAB,
  DEFAULT_VIDEO_TAB,
  MUSIC_TABS,
  NAV_SECTIONS,
  NAV_SECTION_LABELS,
  SETTINGS_TABS,
  TAB_ICONS,
  TAB_LABELS,
  VIDEO_TABS,
  parseTab,
  sectionOfPath,
} from './navigation';

describe('parseTab', () => {
  it('accepts every tab of its section', () => {
    for (const tab of MUSIC_TABS) expect(parseTab(MUSIC_TABS, tab)).toBe(tab);
    for (const tab of VIDEO_TABS) expect(parseTab(VIDEO_TABS, tab)).toBe(tab);
    for (const tab of SETTINGS_TABS) expect(parseTab(SETTINGS_TABS, tab)).toBe(tab);
  });

  it('rejects unknown, other-section and differently cased tabs', () => {
    expect(parseTab(MUSIC_TABS, 'nope')).toBeUndefined();
    expect(parseTab(MUSIC_TABS, 'videos')).toBeUndefined();
    expect(parseTab(VIDEO_TABS, 'Videos')).toBeUndefined();
    expect(parseTab(SETTINGS_TABS, '')).toBeUndefined();
    expect(parseTab(SETTINGS_TABS, undefined)).toBeUndefined();
  });
});

describe('tab metadata', () => {
  it('opens Albums, Videos and General by default', () => {
    expect(DEFAULT_MUSIC_TAB).toBe('albums');
    expect(DEFAULT_VIDEO_TAB).toBe('videos');
    expect(DEFAULT_SETTINGS_TAB).toBe('general');
  });

  it('labels every tab', () => {
    for (const tab of [...MUSIC_TABS, ...VIDEO_TABS, ...SETTINGS_TABS]) {
      expect(TAB_LABELS[tab]).toMatch(/^[A-Z]/);
    }
  });

  it('gives every tab an icon', () => {
    for (const tab of [...MUSIC_TABS, ...VIDEO_TABS, ...SETTINGS_TABS]) {
      expect(TAB_ICONS[tab]).toBeTypeOf('function');
    }
  });
});

describe('sectionOfPath', () => {
  it('matches Home only on the root path', () => {
    expect(sectionOfPath('/')).toBe('home');
    expect(sectionOfPath('/home')).toBeUndefined();
  });

  it('keeps a section active on every page below it', () => {
    expect(sectionOfPath('/music')).toBe('music');
    expect(sectionOfPath('/music/tracks')).toBe('music');
    expect(sectionOfPath('/video/channel/abc')).toBe('video');
    expect(sectionOfPath('/activity')).toBe('activity');
    expect(sectionOfPath('/settings/advanced/')).toBe('settings');
  });

  it('does not match prefixes or other paths', () => {
    expect(sectionOfPath('/musicals')).toBeUndefined();
    expect(sectionOfPath('/dev/tokens')).toBeUndefined();
  });

  it('labels every section', () => {
    for (const section of NAV_SECTIONS) expect(NAV_SECTION_LABELS[section]).toMatch(/^[A-Z]/);
  });
});
