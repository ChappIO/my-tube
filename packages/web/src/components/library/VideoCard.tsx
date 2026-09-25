import type { VideoListItem } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { primeVideo } from '../../api/library';
import { formatLength, publishedAgo } from '../../format';
import { openPreview } from '../../ui-state';
import { Artwork, MediaCard } from '../media';

export interface VideoCardProps {
  video: VideoListItem;
  /**
   * Videos tab: the channel avatar and `NASA · 2 weeks ago`. Off on the channel page (the
   * channel is the page): no avatar, only `2 weeks ago`.
   */
  showChannel: boolean;
  /** The clock for the relative date (`useNow()` of the grid). */
  now: number;
}

/** What a video card shows, without the handlers. */
export interface VideoCardText {
  title: string;
  thumbnailUrl?: string;
  duration?: string;
  /** The avatar's image; `null` for a channel without one (a `surface` circle). */
  avatarUrl?: string | null;
  channel?: string;
  /** The channel page, when the channel was added as a source. */
  channelHref?: string;
  when?: string;
}

/** The pure part of `VideoCard`: title, art, avatar and meta line for a video. */
export function videoCardText(
  video: VideoListItem,
  showChannel: boolean,
  now: number,
): VideoCardText {
  const sourceId = video.channel.sourceId;
  return {
    title: video.title,
    thumbnailUrl: video.thumbnailUrl ?? undefined,
    duration: video.durationSeconds === null ? undefined : formatLength(video.durationSeconds),
    when: publishedAgo(video.publishedAt, now) || undefined,
    ...(showChannel && {
      avatarUrl: video.channel.avatarUrl,
      channel: video.channel.name,
      channelHref: sourceId === null ? undefined : `/video/channel/${sourceId}`,
    }),
  };
}

/**
 * A downloaded video as a wide card (Videos tab, channel page): the 16:9 cached thumbnail with
 * the duration badge, the round channel avatar, the title and `NASA · 2 weeks ago`. The card
 * opens Preview; the channel name opens the channel page when the channel was added as a
 * source, and is plain text otherwise. Home keeps the square `VideoTile`.
 */
export function VideoCard({ video, showChannel, now }: VideoCardProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const text = videoCardText(video, showChannel, now);
  const sourceId = video.channel.sourceId;
  return (
    <MediaCard
      title={text.title}
      art={<Artwork fill src={text.thumbnailUrl} seed={text.title} />}
      duration={text.duration}
      avatar={
        text.avatarUrl === undefined ? undefined : (
          <Artwork fill shape="circle" src={text.avatarUrl ?? undefined} />
        )
      }
      channel={text.channel}
      channelHref={text.channelHref}
      onOpenChannel={
        sourceId === null
          ? undefined
          : () => void navigate({ to: '/video/channel/$id', params: { id: String(sourceId) } })
      }
      when={text.when}
      onOpen={() => {
        primeVideo(queryClient, video);
        openPreview(video.id);
      }}
    />
  );
}
