import { Link, createFileRoute, redirect } from '@tanstack/react-router';
import {
  PlaceholderPage,
  PlaceholderTabs,
  placeholderTabProps,
} from '../components/PlaceholderPage';
import { DEFAULT_MUSIC_TAB, MUSIC_TABS, type MusicTab, TAB_LABELS, parseTab } from '../navigation';

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
    <PlaceholderPage title="Music" sub={`${TAB_LABELS[tab]}. Nothing here yet.`}>
      <PlaceholderTabs>
        {MUSIC_TABS.map((t) => (
          <Link key={t} to="/music/$tab" params={{ tab: t }} {...placeholderTabProps}>
            {TAB_LABELS[t]}
          </Link>
        ))}
      </PlaceholderTabs>
    </PlaceholderPage>
  );
}
