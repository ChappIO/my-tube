import type { Library, LibrarySummary, ResolvedSource, Source, SourceKind } from '@mytube/shared';
import { countOf, formatBytes, formatCadence } from '../../format';

/*
 * The text lines of the sources screens (handoff Screen 3 and Screen 4), as pure functions.
 */

const KIND_LABELS: Record<SourceKind, string> = {
  channel: 'Channel',
  artist: 'Artist',
  playlist: 'Playlist',
};

const LIBRARY_LABELS: Record<Library, string> = { video: 'Video', music: 'Music' };

/** `Channel`, `Artist`, `Playlist`. */
export function kindLabel(kind: SourceKind): string {
  return KIND_LABELS[kind];
}

/** `Video`, `Music`. */
export function libraryLabel(library: Library): string {
  return LIBRARY_LABELS[library];
}

/** What one item is called in a library: videos or tracks. */
function itemCount(library: Library, count: number): string {
  return countOf(count, library === 'video' ? 'video' : 'track');
}

/**
 * The kind a resolved link becomes when saved to `library`, as the API maps it: a playlist
 * stays a playlist, a channel saved to Music is an artist and an artist saved to Video a
 * channel.
 */
export function kindInLibrary(kind: SourceKind, library: Library): SourceKind {
  if (kind === 'playlist') return kind;
  return library === 'music' ? 'artist' : 'channel';
}

/**
 * The Channels row and channel page meta line: `Channel · 214 videos · 38 GB`. Counts that are
 * still 0 (nothing synced yet) are left out, so a new source reads `Channel`.
 */
export function sourceMeta(source: Pick<Source, 'kind' | 'library' | 'itemCount' | 'sizeBytes'>) {
  const parts = [kindLabel(source.kind)];
  if (source.itemCount > 0) parts.push(itemCount(source.library, source.itemCount));
  if (source.sizeBytes > 0) parts.push(formatBytes(source.sizeBytes));
  return parts.join(' · ');
}

/**
 * The Add modal's source card meta (Space Mono, lower case): `channel · 3.2 uploads/week`,
 * `playlist · 9 videos`, `artist`, for the library the source will be saved to.
 */
export function resolvedMeta(resolved: ResolvedSource, library: Library): string {
  const kind = kindInLibrary(resolved.kind, library);
  if (kind === 'playlist') {
    return resolved.itemCount === null
      ? 'playlist'
      : `playlist · ${itemCount(library, resolved.itemCount)}`;
  }
  if (kind === 'artist') return 'artist';
  return `channel · ${formatCadence(resolved.uploadsPerWeek)}`;
}

/**
 * The Video header sub line from `GET /api/library/summary`:
 * `4 channels · 1 playlist · 368 videos · 130 GB`. Playlists, videos and size appear once there
 * are any.
 */
export function videoLibrarySummary(summary: LibrarySummary['videos']): string {
  const parts = [countOf(summary.channels, 'channel')];
  if (summary.playlists > 0) parts.push(countOf(summary.playlists, 'playlist'));
  if (summary.videos > 0) parts.push(countOf(summary.videos, 'video'));
  if (summary.sizeBytes > 0) parts.push(formatBytes(summary.sizeBytes));
  return parts.join(' · ');
}
