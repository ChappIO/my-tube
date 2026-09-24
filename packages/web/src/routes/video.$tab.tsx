import { Link, createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { TabPillLinks } from '../components/ui/TabPills';
import { Body } from '../components/ui/typography';
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
  return (
    <PlaceholderPage
      title="Video"
      sub={`${TAB_LABELS[tab]}. Nothing here yet.`}
      actions={<TabPillLinks label="Video view" items={videoTabItems} value={tab} />}
    >
      <Body muted>
        <Link to="/video/channel/$id" params={{ id: 'example' }}>
          Example channel
        </Link>
      </Body>
    </PlaceholderPage>
  );
}
