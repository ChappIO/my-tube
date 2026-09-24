// Tabbed sections of the app: the tab ids used in URLs, their defaults and their
// display labels and icons. Routes, the app shell and the screens all import from here.

import type { ComponentType } from 'react';
import {
  AdvancedIcon,
  AlbumsIcon,
  ArtistsIcon,
  ChannelsIcon,
  GeneralIcon,
  type IconProps,
  MusicIcon,
  PlaylistsIcon,
  TracksIcon,
  VideoIcon,
  VideosIcon,
} from './components/icons';

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

/**
 * Icon per tab id, shown before the label in the tab pills. An addition to the handoff
 * (its pills are text only), requested by the owner.
 */
export const TAB_ICONS: Record<MusicTab | VideoTab | SettingsTab, ComponentType<IconProps>> = {
  artists: ArtistsIcon,
  albums: AlbumsIcon,
  playlists: PlaylistsIcon,
  tracks: TracksIcon,
  videos: VideosIcon,
  channels: ChannelsIcon,
  general: GeneralIcon,
  music: MusicIcon,
  video: VideoIcon,
  advanced: AdvancedIcon,
};

/** Returns `value` as one of `tabs`, or undefined when it is not one. Tab ids are lowercase. */
export function parseTab<T extends string>(tabs: readonly T[], value: unknown): T | undefined {
  return tabs.find((tab) => tab === value);
}

/** Top-level sections of the app, in sidebar and tab bar order. */
export const NAV_SECTIONS = ['home', 'music', 'video', 'activity', 'settings'] as const;

export type NavSection = (typeof NAV_SECTIONS)[number];

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  home: 'Home',
  music: 'Music',
  video: 'Video',
  activity: 'Activity',
  settings: 'Settings',
};

/**
 * The section a pathname belongs to. Section-level, so `/music/tracks` is Music
 * and `/video/channel/abc` is Video. Home matches `/` only. Undefined for paths
 * outside the five sections (for example `/dev/tokens`).
 */
export function sectionOfPath(pathname: string): NavSection | undefined {
  if (pathname === '/' || pathname === '') return 'home';
  const first = pathname.split('/')[1];
  return NAV_SECTIONS.find((section) => section !== 'home' && section === first);
}
