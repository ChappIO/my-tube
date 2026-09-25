import type { ReactNode } from 'react';
import { createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { AdvancedSettings } from '../components/settings/AdvancedSettings';
import { GeneralSettings } from '../components/settings/GeneralSettings';
import { MusicSettings } from '../components/settings/MusicSettings';
import { VideoSettings } from '../components/settings/VideoSettings';
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

const TAB_CONTENT: Record<SettingsTab, () => ReactNode> = {
  general: GeneralSettings,
  music: MusicSettings,
  video: VideoSettings,
  advanced: AdvancedSettings,
};

function SettingsPage() {
  const { tab } = Route.useParams();
  const Content = TAB_CONTENT[tab];
  return (
    <>
      {/* No sub by design: "Settings" and the tab pills only. */}
      <PageHeader
        title="Settings"
        actions={<TabPillLinks label="Settings section" items={settingsTabItems} value={tab} />}
      />
      <Content />
    </>
  );
}
