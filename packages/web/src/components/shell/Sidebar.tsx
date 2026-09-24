import type { ReactNode } from 'react';
import { LogoLockup } from '../brand/Logo';
import { PlusIcon } from '../icons';
import { Button } from '../ui/Button';
import { NavList } from './NavItem';

/** Wide layout sidebar: lockup, nav, spacer, Add button, footer slot. Hidden below 760px. */
export function Sidebar({
  activityCount,
  onAdd,
  footer,
}: {
  activityCount: number;
  onAdd: () => void;
  footer?: ReactNode;
}) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-line bg-side px-3.5 py-5 wide:flex"
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

/** Sidebar footer: two Space Mono lines, `yt-dlp <version>` over the status line. */
export function SidebarFooter({ version, status }: { version: string; status: string }) {
  return (
    <div className="px-2.5 pt-3.5 pb-1 font-mono text-[11px] leading-[1.6] text-muted">
      yt-dlp {version}
      <br />
      {status}
    </div>
  );
}
