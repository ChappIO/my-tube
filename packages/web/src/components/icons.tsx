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
  ChevronsDown,
  Copy,
  Disc3,
  Ellipsis,
  ExternalLink,
  FileDown,
  Film,
  House,
  ListMusic,
  ListPlus,
  type LucideIcon,
  type LucideProps,
  Music,
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
  Volume2,
  VolumeX,
  Wrench,
  WrapText,
  X,
} from 'lucide-react';
import type { ReactElement, SVGProps } from 'react';

export type IconProps = Omit<LucideProps, 'ref'>;

export const ICON_SIZE = 16;
const STROKE_WIDTH = 2;

/**
 * A filled glyph drawn from its own path (24×24 viewBox, `currentColor`) instead of Lucide: the
 * player's transport glyphs, whose shapes the design gives as paths.
 */
export interface OwnGlyph {
  kind: 'own';
  path: string;
}

function ownGlyph(path: string): OwnGlyph {
  return { kind: 'own', path };
}

function isOwnGlyph(base: LucideIcon | OwnGlyph): base is OwnGlyph {
  return 'kind' in base && base.kind === 'own';
}

export interface IconEntry {
  /** The Lucide glyph or an own path. Unique across the registry. */
  base: LucideIcon | OwnGlyph;
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
  TrashIcon: {
    base: Trash2,
    meaning: 'Delete files',
    usedIn: 'explicit delete actions (demo only since video Preview went)',
  },
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
  CopyIcon: { base: Copy, meaning: 'Copy to the clipboard', usedIn: 'log viewer Copy' },
  DownloadFileIcon: {
    base: FileDown,
    meaning: 'Save a file to this device',
    usedIn: 'log viewer Download',
  },
  WrapIcon: { base: WrapText, meaning: 'Wrap long lines', usedIn: 'log viewer Wrap' },
  AutoScrollIcon: {
    base: ChevronsDown,
    meaning: 'Follow the newest lines (auto-scroll)',
    usedIn: 'log viewer Auto-scroll',
  },

  // The player's transport (own filled paths from the design, 24×24).
  PlayIcon: {
    base: ownGlyph('M8 5v14l11-7z'),
    meaning: 'Play',
    usedIn: 'player bar, album page Play, artist page Play all, paused video (card, frame)',
  },
  PauseIcon: {
    base: ownGlyph('M6 5h4v14H6zM14 5h4v14h-4z'),
    meaning: 'Pause',
    usedIn: 'player bar',
  },
  PreviousIcon: {
    base: ownGlyph('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
    meaning: 'Previous item in the player queue (or restart it)',
    usedIn: 'player bar',
  },
  NextIcon: {
    base: ownGlyph('M16 6h2v12h-2zM6 18l8.5-6L6 6z'),
    meaning: 'Next item in the player queue',
    usedIn: 'player bar, floating card Up next',
  },

  // The player's volume (the bar's mute button).
  VolumeIcon: {
    base: Volume2,
    meaning: 'Sound on (mute it)',
    usedIn: 'player bar mute button, while sound plays',
  },
  MutedIcon: {
    base: VolumeX,
    meaning: 'Muted (unmute)',
    usedIn: 'player bar mute button, while muted or at volume 0',
  },

  // Direction.
  BackIcon: { base: ArrowLeft, meaning: 'Back to parent page', usedIn: 'BackLink ("← Video")' },
  ChevronLeftIcon: {
    base: ChevronLeft,
    meaning: 'Previous page',
    usedIn: 'pagers (not used yet)',
  },
  ChevronRightIcon: { base: ChevronRight, meaning: 'Next page', usedIn: 'pagers (not used yet)' },
  // The Tracks sort direction is text arrows (↑/↓), not an icon.
  ChevronUpIcon: {
    base: ChevronUp,
    meaning: 'Open Now Playing (expand the player)',
    usedIn: 'player bar (stroke 2.5)',
  },
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
}: IconProps & { base: LucideIcon | OwnGlyph }) {
  if (isOwnGlyph(Base)) {
    const { absoluteStrokeWidth: _absolute, ...rest } = props;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        style={{ flexShrink: 0, ...style }}
        {...rest}
      >
        <path d={Base.path} />
      </svg>
    );
  }
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
/** Delete files: explicit delete actions (demo only). */
export const TrashIcon = icon('TrashIcon');
/** Remove a source from the library (files stay): channel page "Remove from library". */
export const UnlinkIcon = icon('UnlinkIcon');
/** Checked / selected: CheckboxRow tick. */
export const CheckIcon = icon('CheckIcon');
/** Copy to the clipboard: log viewer Copy. */
export const CopyIcon = icon('CopyIcon');
/** Save a file to this device: log viewer Download. */
export const DownloadFileIcon = icon('DownloadFileIcon');
/** Wrap long lines: log viewer Wrap. */
export const WrapIcon = icon('WrapIcon');
/** Follow the newest lines (auto-scroll): log viewer Auto-scroll. */
export const AutoScrollIcon = icon('AutoScrollIcon');
/** Open on YouTube / external: external links. */
export const ExternalLinkIcon = icon('ExternalLinkIcon');
/** Check now / re-sync: Check now buttons (yt-dlp, Activity). */
export const RefreshIcon = icon('RefreshIcon');
/** More actions menu: row menus. */
export const MoreIcon = icon('MoreIcon');

/** Play: player bar, album page Play, artist page Play all, paused video. Own filled path. */
export const PlayIcon = icon('PlayIcon');
/** Pause: player bar. Own filled path. */
export const PauseIcon = icon('PauseIcon');
/** Previous item in the player queue (or restart it): player bar. Own filled path. */
export const PreviousIcon = icon('PreviousIcon');
/** Next item in the player queue: player bar, floating card Up next. Own filled path. */
export const NextIcon = icon('NextIcon');

/** Sound on (mute it): the player bar's mute button while sound plays. */
export const VolumeIcon = icon('VolumeIcon');
/** Muted (unmute): the player bar's mute button while muted or at volume 0. */
export const MutedIcon = icon('MutedIcon');

/** Back to parent page: BackLink ("← Video"). */
export const BackIcon = icon('BackIcon');
/** Previous page: pagers. */
export const ChevronLeftIcon = icon('ChevronLeftIcon');
/** Next page: pagers. */
export const ChevronRightIcon = icon('ChevronRightIcon');
/** Open Now Playing (expand the player): the player bar's chevron. */
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
