import { createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { PageHeader } from '../components/ui/PageHeader';
import { TabPillLinks } from '../components/ui/TabPills';
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  type SettingsTab,
  TAB_ICONS,
  TAB_LABELS,
  parseTab,
} from '../navigation';

const settingsTabItems = SETTINGS_TABS.map((tab) => ({
  id: tab,
  label: TAB_LABELS[tab],
  icon: TAB_ICONS[tab],
  link: linkOptions({ to: '/settings/$tab', params: { tab } }),
}));

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
  const tabs = <TabPillLinks label="Settings section" items={settingsTabItems} value={tab} />;
  if (tab === 'general') {
    return (
      <>
        <PageHeader title="Settings" actions={tabs} />
        <GeneralSettings />
      </>
    );
  }
  return (
    <PlaceholderPage
      title="Settings"
      sub={`${TAB_LABELS[tab]}. Nothing here yet.`}
      actions={tabs}
    />
  );
}
