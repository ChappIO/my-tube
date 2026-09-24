// Tabbed sections of the app: the tab ids used in URLs, their defaults and their
// display labels. Routes, the app shell and the screens all import from here.

export const MUSIC_TABS = ['artists', 'albums', 'playlists', 'tracks'] as const;
export const VIDEO_TABS = ['videos', 'channels'] as const;
export const SETTINGS_TABS = ['general', 'music', 'video', 'advanced'] as const;

export type MusicTab = (typeof MUSIC_TABS)[number];
export type VideoTab = (typeof VIDEO_TABS)[number];
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const DEFAULT_MUSIC_TAB: MusicTab = 'albums';
export const DEFAULT_VIDEO_TAB: VideoTab = 'videos';
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'general';

export const TAB_LABELS: Record<MusicTab | VideoTab | SettingsTab, string> = {
  artists: 'Artists',
  albums: 'Albums',
  playlists: 'Playlists',
  tracks: 'Tracks',
  videos: 'Videos',
  channels: 'Channels',
  general: 'General',
  music: 'Music',
  video: 'Video',
  advanced: 'Advanced',
};

/** Returns `value` as one of `tabs`, or undefined when it is not one. Tab ids are lowercase. */
export function parseTab<T extends string>(tabs: readonly T[], value: unknown): T | undefined {
  return tabs.find((tab) => tab === value);
}
