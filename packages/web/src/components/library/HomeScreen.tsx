import { HOME_DAYS_DEFAULT, type HomeItem } from '@mytube/shared';
import { useActivitySummary } from '../../api/activity';
import { useHome } from '../../api/library';
import { countOf, dayLabel, formatBytes, formatCount } from '../../format';
import { useNow } from '../../use-now';
import { TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { PageHeader } from '../ui/PageHeader';
import { StatCard, StatCardGroup } from '../ui/StatCard';
import { Body } from '../ui/typography';
import { DayGroup } from './DayGroup';
import { TrackTile } from './TrackTile';
import { VideoTile } from './VideoTile';

/**
 * Home, "What's new" (handoff Screen 1): the three stat cards and what landed in the last two
 * weeks, grouped by local day, newest first. The queue card follows the badge summary (polled
 * faster while downloads run); the rest comes from `GET /api/library/home`.
 */
export function HomeScreen() {
  const home = useHome();
  const summary = useActivitySummary();
  const now = useNow();
  const stats = home.data?.stats;
  const active = summary.data?.activeDownloads ?? stats?.activeDownloads;

  let body;
  if (home.isPending) body = <StatusLine>Loading what is new.</StatusLine>;
  else if (home.isError) body = <StatusLine>Could not load what is new.</StatusLine>;
  else if (home.data.groups.length === 0) {
    body = <Body muted>Nothing downloaded in the last {HOME_DAYS_DEFAULT} days.</Body>;
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
