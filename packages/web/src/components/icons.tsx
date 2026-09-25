/**
 * The app's icon set and icon registry. Import icons from here, never from `lucide-react`
 * directly, so sizing and stroke stay consistent (16px default, regular 2px stroke; use 16 to
 * 20px in the UI).
 *
 * One icon, one meaning: every icon is named after what it means (`ChannelsIcon`, not
 * `TvIcon`), each meaning has exactly one icon, and no two icons share a Lucide glyph
 * (`icons.spec.ts` enforces this). Reuse the existing icon for a meaning; when a new meaning
 * needs a glyph that is already taken, pick a different glyph. Keep the table in the frontend
 * skill ("Icon registry") in sync with `ICON_REGISTRY`.
 */
import {
  ArrowDownToLine,
  ArrowLeft,
  AudioLines,
  Brackets,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Disc3,
  Ellipsis,
  ExternalLink,
  Film,
  House,
  ListMusic,
  ListPlus,
  type LucideIcon,
  type LucideProps,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Tv,
  Unlink,
  Users,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import type { ReactElement, SVGProps } from 'react';

export type IconProps = Omit<LucideProps, 'ref'>;

export const ICON_SIZE = 16;
const STROKE_WIDTH = 2;

export interface IconEntry {
  /** The Lucide glyph. Unique across the registry. */
  base: LucideIcon;
  /** The one thing this icon means. */
  meaning: string;
  /** Where it appears. */
  usedIn: string;
}

/** Every Lucide-based icon: export name → glyph, meaning, usage. */
export const ICON_REGISTRY = {
  // Sections. The Music and Video icons mean "the music / video library", which is also what
  // the Settings → Music and Settings → Video tabs configure, so those tabs reuse them.
  HomeIcon: { base: House, meaning: 'Home section', usedIn: 'sidebar nav, tab bar' },
  MusicIcon: {
    base: Music,
    meaning: 'Music library',
    usedIn: 'sidebar nav, tab bar, Settings → Music tab',
  },
  VideoIcon: {
    base: Video,
    meaning: 'Video library',
    usedIn: 'sidebar nav, tab bar, Settings → Video tab',
  },
  ActivityIcon: {
    base: ArrowDownToLine,
    meaning: 'Activity section (downloads)',
    usedIn: 'sidebar nav, tab bar',
  },
  SettingsIcon: { base: Settings, meaning: 'Settings section', usedIn: 'sidebar nav, tab bar' },

  // Tabs within a section.
  ArtistsIcon: { base: Users, meaning: 'Artists', usedIn: 'Music → Artists tab' },
  AlbumsIcon: { base: Disc3, meaning: 'Albums', usedIn: 'Music → Albums tab' },
  PlaylistsIcon: { base: ListMusic, meaning: 'Playlists', usedIn: 'Music → Playlists tab' },
  TracksIcon: { base: AudioLines, meaning: 'Tracks', usedIn: 'Music → Tracks tab' },
  VideosIcon: { base: Film, meaning: 'Videos (individual items)', usedIn: 'Video → Videos tab' },
  ChannelsIcon: { base: Tv, meaning: 'Channels', usedIn: 'Video → Channels tab' },
  GeneralIcon: {
    base: SlidersHorizontal,
    meaning: 'General settings',
    usedIn: 'Settings → General tab',
  },
  AdvancedIcon: { base: Wrench, meaning: 'Advanced settings', usedIn: 'Settings → Advanced tab' },

  // Actions.
  PlusIcon: {
    base: Plus,
    meaning: 'Add to library',
    usedIn: 'sidebar Add button, top bar "+", Add modal trigger',
  },
  CloseIcon: {
    base: X,
    meaning: 'Close / dismiss / cancel / remove from a list being edited',
    usedIn: 'Modal close button, Activity queue row cancel, rule builder remove',
  },
  AddConditionIcon: {
    base: ListPlus,
    meaning: 'Add a condition to a rule group',
    usedIn: 'rule builder "+ condition"',
  },
  AddGroupIcon: {
    base: Brackets,
    meaning: 'Add a nested group of conditions',
    usedIn: 'rule builder "+ group"',
  },
  SearchIcon: { base: Search, meaning: 'Search', usedIn: 'search inputs (demo only so far)' },
  PlayIcon: { base: Play, meaning: 'Play (preview)', usedIn: 'preview player' },
  PauseIcon: { base: Pause, meaning: 'Pause (preview)', usedIn: 'preview player' },
  TrashIcon: { base: Trash2, meaning: 'Delete files', usedIn: 'explicit delete actions' },
  UnlinkIcon: {
    base: Unlink,
    meaning: 'Remove a source from the library (files stay)',
    usedIn: 'channel page "Remove from library"',
  },
  CheckIcon: { base: Check, meaning: 'Checked / selected', usedIn: 'CheckboxRow tick' },
  ExternalLinkIcon: {
    base: ExternalLink,
    meaning: 'Open on YouTube / external',
    usedIn: 'external links',
  },
  RefreshIcon: {
    base: RefreshCw,
    meaning: 'Check now / re-sync',
    usedIn: 'Check now buttons (yt-dlp, Activity subscriptions check)',
  },
  MoreIcon: { base: Ellipsis, meaning: 'More actions menu', usedIn: 'row menus' },

  // Direction.
  BackIcon: { base: ArrowLeft, meaning: 'Back to parent page', usedIn: 'BackLink ("← Video")' },
  ChevronLeftIcon: { base: ChevronLeft, meaning: 'Previous', usedIn: 'pagers (not used yet)' },
  ChevronRightIcon: { base: ChevronRight, meaning: 'Next', usedIn: 'pagers (not used yet)' },
  // The Tracks sort direction is text arrows (↑/↓), not an icon.
  ChevronUpIcon: { base: ChevronUp, meaning: 'Collapse', usedIn: 'not used yet' },
  ChevronDownIcon: {
    base: ChevronDown,
    meaning: 'Expand / open a list',
    usedIn: 'selects, rules preview list',
  },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICON_REGISTRY;

function AppIcon({
  base: Base,
  size = ICON_SIZE,
  strokeWidth = STROKE_WIDTH,
  style,
  ...props
}: IconProps & { base: LucideIcon }) {
  return (
    <Base
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden
      // Icons never shrink in flex rows; the size is the size.
      style={{ flexShrink: 0, ...style }}
      {...props}
    />
  );
}

type AppIconComponent = ((props: IconProps) => ReactElement) & { displayName: string };

const builtIcons: [IconName, AppIconComponent][] = [];

function icon(name: IconName): AppIconComponent {
  const { base } = ICON_REGISTRY[name];
  const Icon = (props: IconProps) => <AppIcon base={base} {...props} />;
  Icon.displayName = name;
  builtIcons.push([name, Icon]);
  return Icon;
}

/** Every registry icon component with its name, in declaration order (for `/dev/logo` and tests). */
export function listIcons(): readonly [IconName, AppIconComponent][] {
  return builtIcons;
}

/** Home section: sidebar nav, tab bar. */
export const HomeIcon = icon('HomeIcon');
/** Music library: sidebar nav, tab bar, Settings → Music tab. */
export const MusicIcon = icon('MusicIcon');
/** Video library: sidebar nav, tab bar, Settings → Video tab. */
export const VideoIcon = icon('VideoIcon');
/** Activity section (downloads): sidebar nav, tab bar. */
export const ActivityIcon = icon('ActivityIcon');
/** Settings section: sidebar nav, tab bar. */
export const SettingsIcon = icon('SettingsIcon');

/** Artists: Music → Artists tab. */
export const ArtistsIcon = icon('ArtistsIcon');
/** Albums: Music → Albums tab. */
export const AlbumsIcon = icon('AlbumsIcon');
/** Playlists: Music → Playlists tab. */
export const PlaylistsIcon = icon('PlaylistsIcon');
/** Tracks: Music → Tracks tab. */
export const TracksIcon = icon('TracksIcon');
/** Videos (individual items): Video → Videos tab. */
export const VideosIcon = icon('VideosIcon');
/** Channels: Video → Channels tab. */
export const ChannelsIcon = icon('ChannelsIcon');
/** General settings: Settings → General tab. */
export const GeneralIcon = icon('GeneralIcon');
/** Advanced settings: Settings → Advanced tab. */
export const AdvancedIcon = icon('AdvancedIcon');

/** Add to library: sidebar Add button, top bar "+", Add modal trigger. */
export const PlusIcon = icon('PlusIcon');
/** Close / dismiss / cancel / remove: Modal close, queue row cancel, rule builder remove. */
export const CloseIcon = icon('CloseIcon');
/** Add a condition to a rule group: rule builder "+ condition". */
export const AddConditionIcon = icon('AddConditionIcon');
/** Add a nested group of conditions: rule builder "+ group". */
export const AddGroupIcon = icon('AddGroupIcon');
/** Search: search inputs. */
export const SearchIcon = icon('SearchIcon');
/** Play (preview): preview player. */
export const PlayIcon = icon('PlayIcon');
/** Pause (preview): preview player. */
export const PauseIcon = icon('PauseIcon');
/** Delete files: explicit delete actions. */
export const TrashIcon = icon('TrashIcon');
/** Remove a source from the library (files stay): channel page "Remove from library". */
export const UnlinkIcon = icon('UnlinkIcon');
/** Checked / selected: CheckboxRow tick. */
export const CheckIcon = icon('CheckIcon');
/** Open on YouTube / external: external links. */
export const ExternalLinkIcon = icon('ExternalLinkIcon');
/** Check now / re-sync: Check now buttons (yt-dlp, Activity). */
export const RefreshIcon = icon('RefreshIcon');
/** More actions menu: row menus. */
export const MoreIcon = icon('MoreIcon');

/** Back to parent page: BackLink ("← Video"). */
export const BackIcon = icon('BackIcon');
/** Previous: pagers. */
export const ChevronLeftIcon = icon('ChevronLeftIcon');
/** Next: pagers. */
export const ChevronRightIcon = icon('ChevronRightIcon');
/** Collapse / sort ascending: Tracks table sort. */
export const ChevronUpIcon = icon('ChevronUpIcon');
/** Expand / sort descending: Tracks table sort, selects. */
export const ChevronDownIcon = icon('ChevronDownIcon');

/** The bell path (24×24 viewBox), filled with the current color. Not Lucide. */
export const BELL_PATH =
  'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z';

export interface BellIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
}

/**
 * Subscribed / subscribe: BellToggle, MusicTile's subscribed badge. Not Lucide: the design's
 * own bell path, 14px by default. Outside `ICON_REGISTRY` because it has no Lucide glyph.
 */
export function BellIcon({ size = 14, style, ...props }: BellIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ flexShrink: 0, ...style }}
      {...props}
    >
      <path d={BELL_PATH} />
    </svg>
  );
}
