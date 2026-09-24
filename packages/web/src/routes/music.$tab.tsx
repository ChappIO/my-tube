import { createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { TabPillLinks } from '../components/ui/TabPills';
import { DEFAULT_MUSIC_TAB, MUSIC_TABS, type MusicTab, TAB_LABELS, parseTab } from '../navigation';

const musicTabItems = MUSIC_TABS.map((tab) => ({
  id: tab,
  label: TAB_LABELS[tab],
  link: linkOptions({ to: '/music/$tab', params: { tab } }),
}));

export const Route = createFileRoute('/music/$tab')({
  params: {
    // An unknown tab redirects to the default instead of rendering.
    parse: ({ tab }): { tab: MusicTab } => {
      const parsed = parseTab(MUSIC_TABS, tab);
      if (!parsed) {
        throw redirect({ to: '/music/$tab', params: { tab: DEFAULT_MUSIC_TAB }, replace: true });
      }
      return { tab: parsed };
    },
    stringify: ({ tab }) => ({ tab }),
  },
  component: MusicPage,
});

function MusicPage() {
  const { tab } = Route.useParams();
  return (
    <PlaceholderPage
      title="Music"
      sub={`${TAB_LABELS[tab]}. Nothing here yet.`}
      actions={<TabPillLinks label="Music view" items={musicTabItems} value={tab} />}
    />
  );
}
