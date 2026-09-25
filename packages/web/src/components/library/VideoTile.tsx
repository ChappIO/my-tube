import type { VideoListItem } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { primeVideo } from '../../api/library';
import { formatLength, publishedAgo } from '../../format';
import { openPreview } from '../../ui-state';
import { Artwork, MediaTile } from '../media';

/**
 * What the chin's secondary line shows: `channel` (Home), `channel-when` (Videos tab:
 * `NASA · 2 days ago`) or `when` (the channel page, where the channel is the page).
 */
export type VideoTileMeta = 'channel' | 'channel-when' | 'when';

export interface VideoTileProps {
  video: VideoListItem;
  meta: VideoTileMeta;
  /** The clock for the relative date (`useNow()` of the grid). */
  now: number;
}

/**
 * A downloaded video as a square tile with a fixed chin: the cached thumbnail, the duration
 * badge, the title and the secondary line. The tile opens Preview; the channel name opens the
 * channel page when the channel was added as a source, and is plain text otherwise.
 */
export function VideoTile({ video, meta, now }: VideoTileProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const when = publishedAgo(video.publishedAt, now) || undefined;
  const channelPage = video.channel.sourceId;
  return (
    <MediaTile
      chin="fixed"
      title={video.title}
      art={<Artwork fill src={video.thumbnailUrl ?? undefined} seed={video.title} />}
      duration={video.durationSeconds === null ? undefined : formatLength(video.durationSeconds)}
      channel={meta === 'when' ? undefined : video.channel.name}
      when={meta === 'channel-when' ? when : undefined}
      subtitle={meta === 'when' ? when : undefined}
      onOpen={() => {
        primeVideo(queryClient, video);
        openPreview(video.id);
      }}
      onOpenChannel={
        channelPage === null
          ? undefined
          : () => void navigate({ to: '/video/channel/$id', params: { id: String(channelPage) } })
      }
    />
  );
}
