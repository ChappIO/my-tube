import type { AlbumDetail, HomeItem, TrackListItem } from '@mytube/shared';
import { trackStreamUrl } from '../../api/library';
import { type PlayerItem, playQueue } from '../../player-state';

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
 * The album page's Play (from the first track) and row click (from that row): the album's
 * tracks on disk in album order; missing tracks are skipped. `from` = the album title.
 */
export function albumQueue(album: AlbumDetail, trackId?: number): QueueStart | null {
  return startAt(album.tracks, trackId, album.album.title);
}

/** Play all on the artist page: the artist's tracks on disk in library order. `from` = the artist. */
export function artistQueue(tracks: readonly TrackListItem[], artist: string): QueueStart | null {
  return startAt(tracks, undefined, artist);
}

/** A playlist tile: the playlist's tracks on disk in playlist order. `from` = its name. */
export function playlistQueue(tracks: readonly TrackListItem[], name: string): QueueStart | null {
  return startAt(tracks, undefined, name);
}

/**
 * A Tracks table row: the table as filtered and sorted (the rows loaded so far), from the
 * clicked row down; rows not on disk are skipped. `from` = "Tracks".
 */
export function tracksTableQueue(
  tracks: readonly TrackListItem[],
  trackId: number,
): QueueStart | null {
  return startAt(tracks, trackId, 'Tracks');
}

/** A Home music tile: the music items of its day group in the order shown. `from` = "Home". */
export function homeQueue(items: readonly HomeItem[], trackId: number): QueueStart | null {
  const tracks = items.filter((item) => item.kind === 'music');
  return startAt(tracks, trackId, 'Home');
}

/** Starts what a builder returned (nothing when it returned null). */
export function startQueue(start: QueueStart | null): void {
  if (start) playQueue(start.items, start.index, start.from);
}
