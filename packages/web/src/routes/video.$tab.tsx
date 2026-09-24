import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import {
  PlaceholderPage,
  PlaceholderTabs,
  placeholderTabProps,
} from '../components/PlaceholderPage';
import { DEFAULT_VIDEO_TAB, TAB_LABELS, VIDEO_TABS, type VideoTab, parseTab } from '../navigation';

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
    <PlaceholderPage title="Video" sub={`${TAB_LABELS[tab]}. Nothing here yet.`}>
      <PlaceholderTabs>
        {VIDEO_TABS.map((t) => (
          <Link key={t} to="/video/$tab" params={{ tab: t }} {...placeholderTabProps}>
            {TAB_LABELS[t]}
          </Link>
        ))}
        <Link to="/video/channel/$id" params={{ id: 'example' }}>
          Example channel
        </Link>
      </PlaceholderTabs>
    </PlaceholderPage>
  );
}
