import { Link, linkOptions, useLocation } from '@tanstack/react-router';
import type { ComponentType, ReactNode } from 'react';
import {
  DEFAULT_MUSIC_TAB,
  DEFAULT_SETTINGS_TAB,
  DEFAULT_VIDEO_TAB,
  type NavSection,
  sectionOfPath,
} from '../../navigation';
import {
  ActivityIcon,
  HomeIcon,
  type IconProps,
  MusicIcon,
  SettingsIcon,
  VideoIcon,
} from '../icons';

// Where each section links to (its default tab, which saves a redirect) and its glyph.
const SECTION_LINKS = {
  home: linkOptions({ to: '/' }),
  music: linkOptions({ to: '/music/$tab', params: { tab: DEFAULT_MUSIC_TAB } }),
  video: linkOptions({ to: '/video/$tab', params: { tab: DEFAULT_VIDEO_TAB } }),
  activity: linkOptions({ to: '/activity' }),
  settings: linkOptions({ to: '/settings/$tab', params: { tab: DEFAULT_SETTINGS_TAB } }),
};

export const SECTION_ICONS: Record<NavSection, ComponentType<IconProps>> = {
  home: HomeIcon,
  music: MusicIcon,
  video: VideoIcon,
  activity: ActivityIcon,
  settings: SettingsIcon,
};

/** The section of the current location, or undefined outside the five sections. */
export function useActiveSection(): NavSection | undefined {
  const pathname = useLocation({ select: (location) => location.pathname });
  return sectionOfPath(pathname);
}

/**
 * A link to a section. Active state is section-level (see `sectionOfPath`), so
 * the caller passes `active` and styles it; the link sets `aria-current`.
 */
export function SectionLink({
  section,
  active,
  className,
  children,
}: {
  section: NavSection;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      {...SECTION_LINKS[section]}
      aria-current={active ? 'page' : undefined}
      className={className}
    >
      {children}
    </Link>
  );
}
