import type { AlbumDetail, TrackListItem } from '@mytube/shared';
import { linkOptions } from '@tanstack/react-router';
import { countOf, formatBytes, formatLength } from '../../format';

/*
 * The album page's link and texts (pure, tested in `album-page.spec.ts`): the eyebrow, the meta
 * line, the on-disk status pill, the Download missing button and the File column.
 */

/** The album page of an album (`/music/album/$id`); album tiles link here. */
export function albumPageLink(albumId: number) {
  return linkOptions({ to: '/music/album/$id', params: { id: String(albumId) } });
}

/** The eyebrow over the title: `Album · 2007`, `Album` when the year is unknown. */
export function albumEyebrow(year: number | null): string {
  return year === null ? 'Album' : `Album · ${year}`;
}

/**
 * The meta line: `10 tracks · 42:35 · 97 MB · m4a`. The size is left out while nothing is on
 * disk, the container when the files differ or there are none.
 */
export function albumMetaLine(
  album: Pick<AlbumDetail, 'trackCount' | 'totalDurationSeconds' | 'sizeBytes' | 'container'>,
): string {
  const parts = [countOf(album.trackCount, 'track'), formatLength(album.totalDurationSeconds)];
  if (album.sizeBytes > 0) parts.push(formatBytes(album.sizeBytes));
  if (album.container) parts.push(album.container);
  return parts.join(' · ');
}

export type AlbumStatusTone = 'ok' | 'red';

/**
 * The status pill: `9 of 10 on disk` in red while tracks are missing, `10 of 10 on disk` in
 * green when the album is complete.
 */
export function albumStatus(album: Pick<AlbumDetail, 'trackCount' | 'onDiskCount'>): {
  text: string;
  tone: AlbumStatusTone;
} {
  return {
    text: `${album.onDiskCount} of ${album.trackCount} on disk`,
    tone: album.onDiskCount < album.trackCount ? 'red' : 'ok',
  };
}

/**
 * The primary action: `Download 1 missing` while tracks not on disk have no download queued;
 * `2 queued` (disabled) once they all do; nothing for a complete album.
 */
export function downloadAction(
  album: Pick<AlbumDetail, 'missingCount' | 'queuedCount'>,
): { label: string; disabled: boolean } | null {
  const downloadable = album.missingCount - album.queuedCount;
  if (downloadable > 0) return { label: `Download ${downloadable} missing`, disabled: false };
  if (album.queuedCount > 0) return { label: `${album.queuedCount} queued`, disabled: true };
  return null;
}

/**
 * The File column: each on-disk track's path relative to the album folder, the folder all the
 * album's files share (`01 15 Step.m4a`, or `Disc 2/01 x.m4a` when a template adds disc folders).
 * Tracks that are not on disk get no entry (the column shows `—`).
 */
export function albumFileNames(
  tracks: readonly Pick<TrackListItem, 'id' | 'status' | 'filePath'>[],
): Map<number, string> {
  const onDisk = tracks.filter(
    (track): track is typeof track & { filePath: string } =>
      track.status === 'on_disk' && track.filePath !== null,
  );
  const folders = onDisk.map((track) => track.filePath.split('/').slice(0, -1));
  let shared = folders[0] ?? [];
  for (const folder of folders.slice(1)) {
    let same = 0;
    while (same < shared.length && same < folder.length && shared[same] === folder[same]) same++;
    shared = shared.slice(0, same);
  }
  return new Map(
    onDisk.map((track) => [track.id, track.filePath.split('/').slice(shared.length).join('/')]),
  );
}

/** The `#` column: the album position, zero-padded (`01`), else the row number. */
export function trackNumberLabel(trackNumber: number | null, row: number): string {
  return String(trackNumber ?? row).padStart(2, '0');
}
