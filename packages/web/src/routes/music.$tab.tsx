import type { ComponentType } from 'react';
import { createFileRoute, linkOptions, redirect } from '@tanstack/react-router';
import { useLibrarySummary } from '../api/library';
import { AlbumsTab } from '../components/library/AlbumsTab';
import { ArtistsTab } from '../components/library/ArtistsTab';
import { PlaylistsTab } from '../components/library/PlaylistsTab';
import { TracksTab } from '../components/library/TracksTab';
import { type TrackSearch, parseTrackSearch } from '../components/library/track-list';
import { PageHeader } from '../components/ui/PageHeader';
import { TabPillLinks } from '../components/ui/TabPills';
import { musicLibrarySummary } from '../format';
import {
  DEFAULT_MUSIC_TAB,
  MUSIC_TABS,
  type MusicTab,
  TAB_ICONS,
  TAB_LABELS,
  parseTab,
} from '../navigation';

const musicTabItems = MUSIC_TABS.map((tab) => ({
  id: tab,
  label: TAB_LABELS[tab],
  icon: TAB_ICONS[tab],
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
  // The Tracks tab's filter text, filter and sort (`?q=&filter=missing&sort=title&dir=asc`);
  // invalid values and defaults are dropped.
  validateSearch: (search: Record<string, unknown>): TrackSearch => parseTrackSearch(search),
  component: MusicPage,
});

const TAB_CONTENT = {
  artists: ArtistsTab,
  albums: AlbumsTab,
  playlists: PlaylistsTab,
  tracks: TracksTab,
} satisfies Record<MusicTab, ComponentType>;

/** Music: the header with the library summary and the four tabs. */
function MusicPage() {
  const { tab } = Route.useParams();
  const summary = useLibrarySummary();
  const Content = TAB_CONTENT[tab];
  return (
    <>
      <PageHeader
        title="Music"
        sub={summary.data ? musicLibrarySummary(summary.data.music) : undefined}
        actions={<TabPillLinks label="Music view" items={musicTabItems} value={tab} />}
      />
      <Content />
    </>
  );
}
