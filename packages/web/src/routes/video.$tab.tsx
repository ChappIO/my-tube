import { createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { useLibrarySummary } from '../api/library';
import { VideosTab } from '../components/library/VideosTab';
import { ChannelsTab } from '../components/sources/ChannelsTab';
import { videoLibrarySummary } from '../components/sources/source-text';
import { PageHeader } from '../components/ui/PageHeader';
import { TabPillLinks } from '../components/ui/TabPills';
import {
  DEFAULT_VIDEO_TAB,
  TAB_ICONS,
  TAB_LABELS,
  VIDEO_TABS,
  type VideoTab,
  parseTab,
} from '../navigation';

const videoTabItems = VIDEO_TABS.map((tab) => ({
  id: tab,
  label: TAB_LABELS[tab],
  icon: TAB_ICONS[tab],
  link: linkOptions({ to: '/video/$tab', params: { tab } }),
}));

export const Route = createFileRoute('/video/$tab')({
  params: {
    // An unknown tab redirects to the default instead of rendering.
    parse: ({ tab }): { tab: VideoTab } => {
      const parsed = parseTab(VIDEO_TABS, tab);
      if (!parsed) {
        throw redirect({ to: '/video/$tab', params: { tab: DEFAULT_VIDEO_TAB }, replace: true });
      }
      return { tab: parsed };
    },
    stringify: ({ tab }) => ({ tab }),
  },
  component: VideoPage,
});

function VideoPage() {
  const { tab } = Route.useParams();
  const summary = useLibrarySummary();
  return (
    <>
      <PageHeader
        title="Video"
        sub={summary.data ? videoLibrarySummary(summary.data.videos) : undefined}
        actions={<TabPillLinks label="Video view" items={videoTabItems} value={tab} />}
      />
      {tab === 'channels' ? <ChannelsTab /> : <VideosTab />}
    </>
  );
}
