import { Fragment, type ReactNode } from 'react';
import { LogoLockup } from '../brand/Logo';
import { PlusIcon } from '../icons';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { NavList } from './NavItem';

/**
 * Wide layout sidebar: lockup, nav, spacer, Add button, footer slot. Hidden below 760px. While the
 * player bar is up (`playerBar`) the bottom padding grows by the bar's height plus 32px, so the
 * Add button and the yt-dlp lines sit above the full-width bar instead of under it.
 */
export function Sidebar({
  activityCount,
  onAdd,
  footer,
  playerBar = false,
}: {
  activityCount: number;
  onAdd: () => void;
  footer?: ReactNode;
  playerBar?: boolean;
}) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-line bg-side px-3.5 pt-5 wide:flex',
        playerBar ? 'pb-[calc(20px+var(--player-bar-height,104px)+32px)]' : 'pb-5',
      )}
    >
      <div className="px-2.5 pt-1.5 pb-[22px]">
        <LogoLockup />
      </div>
      <NavList activityCount={activityCount} />
      <div className="flex-1" />
      <Button variant="primary" size="xl" fullWidth icon={<PlusIcon />} onClick={onAdd}>
        Add to library
      </Button>
      {footer}
    </nav>
  );
}

/**
 * Sidebar footer: two Space Mono lines, `yt-dlp <version>` over the status line. The status
 * parts (`up to date`, `auto-update on`) never break inside; a long line wraps at the ` · `.
 */
export function SidebarFooter({ version, status }: { version: string; status: string }) {
  const parts = status.split(' · ');
  return (
    <div className="px-2.5 pt-3.5 pb-1 font-mono text-[11px] leading-[1.6] text-muted">
      yt-dlp {version}
      <br />
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && ' · '}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </div>
  );
}
