import type { VideoListItem } from '@mytube/shared';
import { useNavigate } from '@tanstack/react-router';
import { formatLength, publishedAgo } from '../../format';
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
  /** Plays the video in the player (Home builds the queue from the day group). */
  onPlay: () => void;
}

/**
 * A downloaded video as a square tile with a fixed chin: the cached thumbnail, the duration
 * badge, the title and the secondary line. The tile plays the video (`onPlay`); the channel name
 * opens the channel page when the channel was added as a source, and is plain text otherwise.
 */
export function VideoTile({ video, meta, now, onPlay }: VideoTileProps) {
  const navigate = useNavigate();
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
      onOpen={onPlay}
      onOpenChannel={
        channelPage === null
          ? undefined
          : () => void navigate({ to: '/video/channel/$id', params: { id: String(channelPage) } })
      }
    />
  );
}
