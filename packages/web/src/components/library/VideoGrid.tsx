import { type VideoFilter, useVideos } from '../../api/library';
import { useNow } from '../../use-now';
import { CardGrid } from '../media';
import { channelPageQueue, startQueue, videosTabQueue } from '../player/queues';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { VideoCard } from './VideoCard';

export interface VideoGridProps {
  /** Which videos (`GET /api/library/videos`): on disk, newest published first by default. */
  filter?: VideoFilter;
  /** Avatar and channel name on each card (Videos tab); off on the channel page. */
  showChannel: boolean;
  /**
   * What a card plays. `channel` (Videos tab): the loaded list filtered to the card's channel.
   * `page` (channel page): the whole loaded list, `from` = `pageName`.
   */
  queue: 'channel' | 'page';
  /** The channel page's name, the queue's `from`. */
  pageName?: string;
}

/**
 * A grid of downloaded videos as wide `VideoCard`s (Videos tab, channel page): 60 per page and an outlined
 * **Load more** under the grid while there are more. "Nothing downloaded yet." when empty. A card
 * starts a queue of its channel in the order shown (`queue`).
 */
export function VideoGrid({ filter = {}, showChannel, queue, pageName }: VideoGridProps) {
  const videos = useVideos(filter);
  const now = useNow();

  if (loadFailed(videos)) return <ErrorState what="the videos" {...fromQuery(videos)} />;
  if (videos.data === undefined) return <StatusLine>Loading videos.</StatusLine>;
  const items = videos.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <EmptyState>Nothing downloaded yet.</EmptyState>;

  return (
    <>
      <CardGrid>
        {items.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            showChannel={showChannel}
            now={now}
            onPlay={() =>
              startQueue(
                queue === 'page'
                  ? channelPageQueue(items, video.id, now, pageName)
                  : videosTabQueue(items, video.id, now),
              )
            }
          />
        ))}
      </CardGrid>
      {videos.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outlined"
            disabled={videos.isFetchingNextPage}
            onClick={() => void videos.fetchNextPage()}
          >
            {videos.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
      {videos.isFetchNextPageError && (
        <ErrorState
          what="more videos"
          error={videos.error}
          onRetry={() => void videos.fetchNextPage()}
          retrying={videos.isFetchingNextPage}
        />
      )}
    </>
  );
}
