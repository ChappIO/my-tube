import { type VideoFilter, useVideos } from '../../api/library';
import { useNow } from '../../use-now';
import { TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { Body } from '../ui/typography';
import { VideoTile, type VideoTileMeta } from './VideoTile';

export interface VideoGridProps {
  /** Which videos (`GET /api/library/videos`): on disk, newest published first by default. */
  filter?: VideoFilter;
  /** The chin's secondary line (see `VideoTile`). */
  meta: VideoTileMeta;
}

/**
 * A grid of downloaded videos (Videos tab, channel page): 60 tiles per page and an outlined
 * **Load more** under the grid while there are more. "Nothing downloaded yet." when empty.
 */
export function VideoGrid({ filter = {}, meta }: VideoGridProps) {
  const videos = useVideos(filter);
  const now = useNow();

  if (videos.isPending) return <StatusLine>Loading videos.</StatusLine>;
  if (videos.isError) return <StatusLine>Could not load the videos.</StatusLine>;
  const items = videos.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <Body muted>Nothing downloaded yet.</Body>;

  return (
    <>
      <TileGrid>
        {items.map((video) => (
          <VideoTile key={video.id} video={video} meta={meta} now={now} />
        ))}
      </TileGrid>
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
      {videos.isFetchNextPageError && <StatusLine>Could not load more videos.</StatusLine>}
    </>
  );
}
