/**
 * The app's icon set. Import icons from here, never from `lucide-react` directly, so sizing
 * and stroke stay consistent (16px default, regular 2px stroke; use 16 to 20px in the UI).
 */
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Ellipsis,
  ExternalLink,
  House,
  type LucideIcon,
  type LucideProps,
  Music,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import type { SVGProps } from 'react';

export type IconProps = Omit<LucideProps, 'ref'>;

export const ICON_SIZE = 16;
const STROKE_WIDTH = 2;

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

function icon(base: LucideIcon, name: string) {
  const Icon = (props: IconProps) => <AppIcon base={base} {...props} />;
  Icon.displayName = name;
  return Icon;
}

// Navigation
export const HomeIcon = icon(House, 'HomeIcon');
export const MusicIcon = icon(Music, 'MusicIcon');
export const VideoIcon = icon(Video, 'VideoIcon');
export const ActivityIcon = icon(ArrowDownToLine, 'ActivityIcon');
export const SettingsIcon = icon(Settings, 'SettingsIcon');

// Actions
export const PlusIcon = icon(Plus, 'PlusIcon');
export const CloseIcon = icon(X, 'CloseIcon');
export const SearchIcon = icon(Search, 'SearchIcon');
export const PlayIcon = icon(Play, 'PlayIcon');
export const PauseIcon = icon(Pause, 'PauseIcon');
export const TrashIcon = icon(Trash2, 'TrashIcon');
export const CheckIcon = icon(Check, 'CheckIcon');
export const ExternalLinkIcon = icon(ExternalLink, 'ExternalLinkIcon');
export const RefreshIcon = icon(RefreshCw, 'RefreshIcon');
export const MoreIcon = icon(Ellipsis, 'MoreIcon');

// Direction
export const BackIcon = icon(ArrowLeft, 'BackIcon');
export const ChevronLeftIcon = icon(ChevronLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = icon(ChevronRight, 'ChevronRightIcon');
export const ChevronUpIcon = icon(ChevronUp, 'ChevronUpIcon');
export const ChevronDownIcon = icon(ChevronDown, 'ChevronDownIcon');

/** The handoff's bell path (24×24 viewBox), filled with the current color. */
export const BELL_PATH =
  'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z';

export interface BellIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
}

/** Subscribe bell. Uses the design's own path rather than Lucide's bell; 14px by default. */
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
