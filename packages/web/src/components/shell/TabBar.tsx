import { NAV_SECTIONS, NAV_SECTION_LABELS, type NavSection } from '../../navigation';
import { cx, focusRingInset } from '../ui/cx';
import { SECTION_ICONS, SectionLink, useActiveSection } from './sections';

function TabBarItem({
  section,
  active,
  badgeCount,
}: {
  section: NavSection;
  active: boolean;
  badgeCount: number;
}) {
  const Icon = SECTION_ICONS[section];
  return (
    <SectionLink
      section={section}
      active={active}
      className={cx(
        'relative grid min-h-11 content-start justify-items-center gap-[3px] rounded-nav py-2 font-sans text-[11px] font-semibold',
        focusRingInset,
        active ? 'text-ink' : 'text-muted',
      )}
    >
      <Icon />
      {NAV_SECTION_LABELS[section]}
      {badgeCount > 0 && (
        <span className="absolute top-1 right-[calc(50%-20px)] rounded-pill bg-red px-[5px] py-px font-mono text-[9px] font-bold text-white">
          {badgeCount}
        </span>
      )}
    </SectionLink>
  );
}

/** Narrow layout bottom tab bar: the five sections in a fixed 5-column grid. Hidden at 760px and up. */
export function TabBar({ activityCount }: { activityCount: number }) {
  const active = useActiveSection();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-[5] grid grid-cols-5 border-t border-line bg-side px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] wide:hidden"
    >
      {NAV_SECTIONS.map((section) => (
        <TabBarItem
          key={section}
          section={section}
          active={section === active}
          badgeCount={section === 'activity' ? activityCount : 0}
        />
      ))}
    </nav>
  );
}
