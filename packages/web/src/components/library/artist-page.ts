import type { ArtistAlbum, ArtistDetail, OtherRelease } from '@mytube/shared';
import { linkOptions } from '@tanstack/react-router';
import { countOf } from '../../format';

/*
 * The artist page's link and texts (pure, tested in `artist-page.spec.tsx`): the meta line, the
 * Download missing button, the tile's missing badge, the release rows and the Subscription card.
 */

/** The artist page of an artist (`/music/artist/$id`); artist tiles and names link here. */
export function artistPageLink(artistId: number) {
  return linkOptions({ to: '/music/artist/$id', params: { id: String(artistId) } });
}

/**
 * The meta line under the name: `9 albums · 112 tracks on disk · 1 missing` (the missing part
 * only while tracks are not on disk).
 */
export function artistMetaLine(
  detail: Pick<ArtistDetail, 'albumCount' | 'onDiskTracks' | 'missingTracks'>,
): string {
  const parts = [
    countOf(detail.albumCount, 'album'),
    `${countOf(detail.onDiskTracks, 'track')} on disk`,
  ];
  if (detail.missingTracks > 0) parts.push(`${detail.missingTracks} missing`);
  return parts.join(' · ');
}

/**
 * The primary action: `Download 3 missing tracks` (`1 missing track`) while tracks not on disk
 * have no download queued; `2 queued` (disabled) once they all do; nothing while every track is
 * on disk.
 */
export function artistDownloadAction(
  detail: Pick<ArtistDetail, 'missingTracks' | 'queuedTracks'>,
): { label: string; disabled: boolean } | null {
  const downloadable = detail.missingTracks - detail.queuedTracks;
  if (downloadable > 0) {
    return { label: `Download ${countOf(downloadable, 'missing track')}`, disabled: false };
  }
  if (detail.queuedTracks > 0) return { label: `${detail.queuedTracks} queued`, disabled: true };
  return null;
}

/** A library tile's meta line: `2007 · 10 tracks`, `10 tracks` without a year. */
export function libraryAlbumMeta(album: Pick<ArtistAlbum, 'year' | 'trackCount'>): string {
  const tracks = countOf(album.trackCount, 'track');
  return album.year === null ? tracks : `${album.year} · ${tracks}`;
}

/** The red badge on an incomplete album's tile: `1 missing`; none when complete. */
export function missingBadge(album: Pick<ArtistAlbum, 'missingCount'>): string | undefined {
  return album.missingCount > 0 ? `${album.missingCount} missing` : undefined;
}

/** A "Not in library" row's meta line: `1993 · 12 tracks`, `12 tracks` without a year. */
export function releaseMeta(release: Pick<OtherRelease, 'year' | 'trackCount'>): string {
  const tracks = countOf(release.trackCount, 'track');
  return release.year === null ? tracks : `${release.year} · ${tracks}`;
}

/** The section counts: `1 album`, `7 releases · from YouTube Music`. */
export function inLibraryCount(count: number): string {
  return countOf(count, 'album');
}

export function notInLibraryCount(count: number): string {
  return `${countOf(count, 'release')} · from YouTube Music`;
}

/** The Subscription card's Checks row: `every 6 h` (Settings → General, Check for new content). */
export function checksLabel(hours: number): string {
  return `every ${hours} h`;
}

/** The Subscription card's Since row: the month the source was added, `June 2026`. */
export function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
