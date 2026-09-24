import { NAV_SECTIONS, NAV_SECTION_LABELS, type NavSection } from '../../navigation';
import { cx, focusRingInset } from '../ui/cx';
import { SECTION_ICONS, SectionLink, useActiveSection } from './sections';

/** Sidebar nav row: glyph + label, red count pill right-aligned when `badgeCount > 0`. */
export function NavItem({
  section,
  active,
  badgeCount = 0,
}: {
  section: NavSection;
  active: boolean;
  badgeCount?: number;
}) {
  const Icon = SECTION_ICONS[section];
  return (
    <SectionLink
      section={section}
      active={active}
      className={cx(
        'flex items-center gap-3 rounded-nav px-3 py-[11px] text-nav hover:bg-surface',
        focusRingInset,
        active ? 'bg-surface text-ink' : 'text-muted',
      )}
    >
      <Icon className="text-muted" />
      {NAV_SECTION_LABELS[section]}
      {badgeCount > 0 && (
        <span className="ml-auto rounded-pill bg-red px-[7px] py-0.5 text-nav-badge text-white">
          {badgeCount}
        </span>
      )}
    </SectionLink>
  );
}

/** The five sidebar nav rows. `activityCount` feeds the Activity badge. */
export function NavList({ activityCount }: { activityCount: number }) {
  const active = useActiveSection();
  return (
    <ul className="contents">
      {NAV_SECTIONS.map((section) => (
        <li key={section} className="contents">
          <NavItem
            section={section}
            active={section === active}
            badgeCount={section === 'activity' ? activityCount : 0}
          />
        </li>
      ))}
    </ul>
  );
}
