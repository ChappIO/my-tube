import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import {
  PlaceholderPage,
  PlaceholderTabs,
  placeholderTabProps,
} from '../components/PlaceholderPage';
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  type SettingsTab,
  TAB_LABELS,
  parseTab,
} from '../navigation';

export const Route = createFileRoute('/settings/$tab')({
  params: {
    // An unknown tab redirects to the default instead of rendering.
    parse: ({ tab }): { tab: SettingsTab } => {
      const parsed = parseTab(SETTINGS_TABS, tab);
      if (!parsed) {
        throw redirect({
          to: '/settings/$tab',
          params: { tab: DEFAULT_SETTINGS_TAB },
          replace: true,
        });
      }
      return { tab: parsed };
    },
    stringify: ({ tab }) => ({ tab }),
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useParams();
  return (
    <PlaceholderPage title="Settings" sub={`${TAB_LABELS[tab]}. Nothing here yet.`}>
      <PlaceholderTabs>
        {SETTINGS_TABS.map((t) => (
          <Link key={t} to="/settings/$tab" params={{ tab: t }} {...placeholderTabProps}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </PlaceholderTabs>
    </PlaceholderPage>
  );
}
