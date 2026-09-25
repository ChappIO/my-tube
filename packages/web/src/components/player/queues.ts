import type { AlbumDetail, HomeItem, TrackListItem, VideoListItem } from '@mytube/shared';
import { trackStreamUrl, videoPlayUrl } from '../../api/library';
import { publishedAgo } from '../../format';
import { type PlayerItem, appendToQueue, playQueue, playerState } from '../../player-state';

/*
 * The queue sources (frontend skill "Player", "Queue model"): pure builders from the DTOs a
 * screen already holds to what `playQueue(items, index, from)` takes. Everything a builder puts
 * in a queue is on disk; only an explicit add to queue (`trackItem` of a missing track) is not.
 */

/** What a click starts: the items, the one to start at and the queue's label. */
export interface QueueStart {
  items: PlayerItem[];
  index: number;
  from: string;
}

/** A track as a queue item. A track that is not on disk is marked `missing`. */
export function trackItem(track: TrackListItem): PlayerItem {
  const item: PlayerItem = {
    kind: 'music',
    id: track.id,
    title: track.title,
    sub: track.artist.name,
    dur: track.durationSeconds ?? 0,
    artUrl: track.coverUrl,
    fileUrl: trackStreamUrl(track.id),
  };
  if (track.album) {
    item.album = track.album.title;
    item.albumId = track.album.id;
  }
  if (track.status !== 'on_disk') item.missing = true;
  return item;
}

/** Whether a track can be played (it is on disk). */
export function playable(track: Pick<TrackListItem, 'status'>): boolean {
  return track.status === 'on_disk';
}

/**
 * The on-disk tracks of a list in its order, starting at `trackId` (the first of them without
 * one). Null when nothing is on disk or the clicked track is not.
 */
function startAt(
  tracks: readonly TrackListItem[],
  trackId: number | undefined,
  from: string,
): QueueStart | null {
  const onDisk = tracks.filter(playable);
  if (onDisk.length === 0) return null;
  const index = trackId === undefined ? 0 : onDisk.findIndex((track) => track.id === trackId);
  if (index === -1) return null;
  return { items: onDisk.map(trackItem), index, from };
}

/**
 * A click on one track plays that track, not a queue (Thomas's request): a one-item queue, which
 * opens Now Playing at once. `from` = its album title, else `fallback`. Null when the track is
 * not in the list or not on disk.
 */
export function singleTrack(
  tracks: readonly TrackListItem[],
  trackId: number,
  fallback: string,
): QueueStart | null {
  const track = tracks.find((entry) => entry.id === trackId);
  if (!track || !playable(track)) return null;
  return { items: [trackItem(track)], index: 0, from: track.album?.title ?? fallback };
}

/**
 * The album page's Play: the album's tracks on disk in album order (missing ones skipped). A row
 * click (`trackId`) plays that one track alone. `from` = the album title.
 */
export function albumQueue(album: AlbumDetail, trackId?: number): QueueStart | null {
  if (trackId !== undefined) return singleTrack(album.tracks, trackId, album.album.title);
  return startAt(album.tracks, undefined, album.album.title);
}

/** Play all on the artist page: the artist's tracks on disk in library order. `from` = the artist. */
export function artistQueue(tracks: readonly TrackListItem[], artist: string): QueueStart | null {
  return startAt(tracks, undefined, artist);
}

/** A playlist tile: the playlist's tracks on disk in playlist order. `from` = its name. */
export function playlistQueue(tracks: readonly TrackListItem[], name: string): QueueStart | null {
  return startAt(tracks, undefined, name);
}

/** A Tracks table row: that track alone. `from` = its album, else "Tracks". */
export function tracksTableQueue(
  tracks: readonly TrackListItem[],
  trackId: number,
): QueueStart | null {
  return singleTrack(tracks, trackId, 'Tracks');
}

/** A Home music tile: that track alone. `from` = its album, else "Home". */
export function homeQueue(items: readonly HomeItem[], trackId: number): QueueStart | null {
  const tracks = items.filter((item) => item.kind === 'music');
  return singleTrack(tracks, trackId, 'Home');
}

/** A video on disk as a queue item: the channel as the sub, the relative upload date. */
export function videoItem(video: VideoListItem, now: number): PlayerItem {
  const item: PlayerItem = {
    kind: 'video',
    id: video.id,
    title: video.title,
    sub: video.channel.name,
    dur: video.durationSeconds ?? 0,
    artUrl: video.thumbnailUrl,
    fileUrl: videoPlayUrl(video.id),
  };
  const when = publishedAgo(video.publishedAt, now);
  if (when) item.when = when;
  if (video.channel.sourceId !== null) item.channelPageId = video.channel.sourceId;
  const container = /\.([a-z0-9]+)$/i.exec(video.filePath ?? '')?.[1];
  if (container) item.container = container.toLowerCase();
  return item;
}

/**
 * A click on a video plays that video alone (Thomas's request: videos have no playlists, so a
 * video never forms a queue): a one-item queue, which opens Now Playing at once. `from` = the
 * channel name. Null when the video is not in the list or not on disk. The Videos tab and the
 * channel page start it; Home through `homeVideoQueue`.
 */
export function singleVideo(
  videos: readonly VideoListItem[],
  videoId: number,
  now: number,
): QueueStart | null {
  const video = videos.find((entry) => entry.id === videoId);
  if (!video || video.status !== 'on_disk') return null;
  return { items: [videoItem(video, now)], index: 0, from: video.channel.name };
}

/** A Home video tile: that video alone. */
export function homeVideoQueue(
  items: readonly HomeItem[],
  videoId: number,
  now: number,
): QueueStart | null {
  const videos = items.filter((item) => item.kind === 'video');
  return singleVideo(videos, videoId, now);
}

let openNowPlaying: (() => void) | null = null;

/**
 * The shell's way to open Now Playing (`PlayerLayer` registers the route push; null when it
 * unmounts). Kept here so every start path opens it the same way without threading it through.
 */
export function setNowPlayingOpener(open: (() => void) | null): void {
  openNowPlaying = open;
}

/**
 * Starts what a builder returned (nothing when it returned null). A queue of one item (a clicked
 * track or video, an album or playlist with one track on disk, …)
 * opens Now Playing at once (Thomas's request); longer queues play in the bar and card.
 */
export function startQueue(start: QueueStart | null): void {
  if (!start) return;
  playQueue(start.items, start.index, start.from);
  if (start.items.length === 1 && playerState().player) openNowPlaying?.();
}

/**
 * "+" on an album row: appends to the queue that plays (never opens Now Playing); when that
 * starts a new one-item queue (nothing playing, or a video), Now Playing opens as for any
 * one-item start.
 */
export function addToQueue(item: PlayerItem): void {
  const before = playerState().player;
  appendToQueue(item);
  const after = playerState().player;
  if (
    after &&
    after !== before &&
    after.queue.length === 1 &&
    (!before || before.kind !== item.kind)
  ) {
    openNowPlaying?.();
  }
}
