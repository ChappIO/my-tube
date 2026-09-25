import { HOME_DAYS_DEFAULT, type HomeItem } from '@mytube/shared';
import { useActivitySummary } from '../../api/activity';
import { useHome } from '../../api/library';
import { countOf, dayLabel, formatBytes, formatCount } from '../../format';
import { openAdd } from '../../ui-state';
import { useNow } from '../../use-now';
import { PlusIcon } from '../icons';
import { TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { PageHeader } from '../ui/PageHeader';
import { StatCard, StatCardGroup } from '../ui/StatCard';
import { DayGroup } from './DayGroup';
import { TrackTile } from './TrackTile';
import { VideoTile } from './VideoTile';

/**
 * Home, "What's new": the three stat cards and what landed in the last two
 * weeks, grouped by local day, newest first. The queue card follows the badge summary (polled
 * faster while downloads run); the rest comes from `GET /api/library/home`. A library with
 * nothing downloaded ever gets the one empty state with the Add to library button.
 */
export function HomeScreen() {
  const home = useHome();
  const summary = useActivitySummary();
  const now = useNow();
  const stats = home.data?.stats;
  const active = summary.data?.activeDownloads ?? stats?.activeDownloads;

  let body;
  // A failed refetch keeps what was loaded; the error shows only when there is nothing.
  if (loadFailed(home)) body = <ErrorState what="what is new" {...fromQuery(home)} />;
  else if (home.data === undefined) body = <StatusLine>Loading what is new.</StatusLine>;
  else if (home.data.groups.length === 0 && home.data.stats.librarySizeBytes === 0) {
    body = (
      <EmptyState
        action={
          <Button variant="outlined" icon={<PlusIcon />} onClick={openAdd}>
            Add to library
          </Button>
        }
      >
        Nothing downloaded yet. Add a channel or an artist to get started.
      </EmptyState>
    );
  } else if (home.data.groups.length === 0) {
    body = <EmptyState>Nothing downloaded in the last {HOME_DAYS_DEFAULT} days.</EmptyState>;
  } else {
    const today = new Date(now);
    body = home.data.groups.map((group) => (
      <DayGroup key={group.day} label={dayLabel(group.day, today)}>
        <TileGrid>
          {group.items.map((item) => (
            <HomeTile key={`${item.kind}:${item.id}`} item={item} now={now} />
          ))}
        </TileGrid>
      </DayGroup>
    ));
  }

  return (
    <>
      <PageHeader
        title="What's new"
        sub="Across music and video, newest first."
        actions={
          <StatCardGroup>
            <StatCard
              label="queue"
              value={active === undefined ? '—' : `${formatCount(active)} downloading`}
            />
            <StatCard
              label="downloaded, all time"
              value={stats ? countOf(stats.downloadedAllTime, 'file') : '—'}
            />
            <StatCard label="library" value={stats ? formatBytes(stats.librarySizeBytes) : '—'} />
          </StatCardGroup>
        }
      />
      {body}
    </>
  );
}

/**
 * One Home item. Videos get the fixed chin with the channel; tracks show only their cover, with
 * the chin sliding up on hover.
 */
function HomeTile({ item, now }: { item: HomeItem; now: number }) {
  if (item.kind === 'music') return <TrackTile track={item} />;
  return <VideoTile video={item} meta="channel" now={now} />;
}
