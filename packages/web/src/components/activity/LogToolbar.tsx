import type { ReactNode } from 'react';
import { AutoScrollIcon, CopyIcon, DownloadFileIcon, WrapIcon } from '../icons';
import { Button } from '../ui/Button';
import { Meta } from '../ui/typography';
import { type CopyState, type LogView, copyLabel } from './job-log';

export interface LogToolbarProps {
  view: LogView;
  copyState: CopyState;
  onCopy: () => void;
  onDownload: () => void;
  onToggleWrap: () => void;
  onToggleAutoScroll: () => void;
  /** No log to act on yet: Copy and Download are disabled. */
  empty: boolean;
  /** Right-aligned: `1,284 lines`. */
  lines?: string | null;
  /** Right-aligned after the lines on wide screens: `212 KB`. */
  size?: string | null;
}

/**
 * The log block's top part (`LogPane` hangs it above the scroller, like a tile's chin under its
 * art): `surface`, a 1px `line` divider below, padding 8px 12px. Outlined pills with a 14px icon
 * before the label: **Copy** (the whole log; "Copied" for 1.5 s), **Download** (`job-<id>.log`),
 * and the toggles **Wrap** and **Auto-scroll** (`aria-pressed`, `ink` border when on). Below
 * 760px the labels hide (the buttons keep them as `aria-label`) so the four fit on one line,
 * and the copy result replaces the line count for 1.5 s. Right: Space Mono 11 muted
 * `1,284 lines · 212 KB`.
 */
export function LogToolbar({
  view,
  copyState,
  onCopy,
  onDownload,
  onToggleWrap,
  onToggleAutoScroll,
  empty,
  lines,
  size,
}: LogToolbarProps) {
  const copied = copyState !== 'idle';
  return (
    <div
      role="toolbar"
      aria-label="Log"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2"
    >
      <ToolbarButton
        label={copyLabel(copyState)}
        icon={<CopyIcon size={14} />}
        onClick={onCopy}
        disabled={empty}
      />
      <ToolbarButton
        label="Download"
        icon={<DownloadFileIcon size={14} />}
        onClick={onDownload}
        disabled={empty}
      />
      <ToolbarButton
        label="Wrap"
        icon={<WrapIcon size={14} />}
        pressed={view.wrap}
        onClick={onToggleWrap}
      />
      <ToolbarButton
        label="Auto-scroll"
        icon={<AutoScrollIcon size={14} />}
        pressed={view.autoScroll}
        onClick={onToggleAutoScroll}
      />
      <Meta size="sm" className="ml-auto whitespace-nowrap">
        {copied && <span className="wide:hidden">{copyLabel(copyState)}</span>}
        {lines && <span className={copied ? 'hidden wide:inline' : undefined}>{lines}</span>}
        {lines && size && <span className="hidden wide:inline">{` · ${size}`}</span>}
      </Meta>
    </div>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Button
      variant="outlined"
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      pressed={pressed}
      aria-label={label}
    >
      <span className="hidden wide:inline">{label}</span>
    </Button>
  );
}
