import {
  AlbumListItem,
  ArtistListItem,
  type ArtworkKind,
  HomeFeed,
  LibrarySummary,
  PlaylistListItem,
  TrackListItem,
  type TrackListQuery,
  TrackPage,
  type VideoListQuery,
  VideoListItem,
  VideoPage,
  artworkPath,
} from '@mytube/shared';
import {
  type QueryClient,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { useActivitySummary } from './activity';
import { ApiError, apiDelete, apiGet } from './client';

/*
 * The library read models (`/api/library/*`, backend skill "Library"): the videos grid, the
 * Music tabs (artists, albums, playlists), Home, the header summaries, one video or track for
 * Preview and Delete file. Everything starts with `['library']`, so a finished download or a
 * deletion refreshes all of it at once.
 */

/** The filter of a videos grid (`GET /api/library/videos`); the cursor is the page param. */
export type VideoFilter = Partial<Omit<VideoListQuery, 'cursor'>>;

export const libraryKeys = {
  all: ['library'] as const,
  videos: (filter: VideoFilter) => ['library', 'videos', filter] as const,
  video: (id: number) => ['library', 'video', id] as const,
  home: ['library', 'home'] as const,
  summary: ['library', 'summary'] as const,
  artists: ['library', 'artists'] as const,
  albums: (artistId: number | undefined) => ['library', 'albums', artistId ?? 'all'] as const,
  playlists: ['library', 'playlists'] as const,
  track: (id: number) => ['library', 'track', id] as const,
  tracks: (filter: TrackFilterState) => ['library', 'tracks', filter] as const,
};

function videosUrl(filter: VideoFilter, cursor: string | null): string {
  const params = new URLSearchParams();
  const { channelId, sourceId, status, sort, limit } = filter;
  if (channelId !== undefined) params.set('channelId', String(channelId));
  if (sourceId !== undefined) params.set('sourceId', String(sourceId));
  if (status !== undefined) params.set('status', status);
  if (sort !== undefined) params.set('sort', sort);
  if (limit !== undefined) params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `/api/library/videos?${query}` : '/api/library/videos';
}

/** A videos grid, 60 per page; `fetchNextPage` loads the next one while `hasNextPage`. */
export function useVideos(filter: VideoFilter = {}) {
  return useInfiniteQuery({
    queryKey: libraryKeys.videos(filter),
    queryFn: ({ pageParam }) => apiGet(videosUrl(filter, pageParam), VideoPage),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/**
 * One video (`GET /api/library/videos/:id`), for Preview. A 404 is not retried; ids below 1
 * never fetch.
 */
export function useVideo(id: number) {
  return useQuery({
    queryKey: libraryKeys.video(id),
    enabled: id > 0,
    queryFn: () => apiGet(`/api/library/videos/${id}`, VideoListItem),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/** Seeds the single-video cache from a grid tile, so Preview renders without a request. */
export function primeVideo(queryClient: QueryClient, video: VideoListItem): void {
  queryClient.setQueryData(libraryKeys.video(video.id), video);
}

/**
 * Home (`GET /api/library/home`) in the browser's time zone. It refreshes through
 * `useLibraryFollowsDownloads` when a download finishes; the queue card reads the badge summary.
 */
export function useHome() {
  return useQuery({
    queryKey: libraryKeys.home,
    queryFn: () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return apiGet(`/api/library/home?tz=${encodeURIComponent(tz)}`, HomeFeed);
    },
  });
}

/** The Video header sub line (`GET /api/library/summary`). */
export function useLibrarySummary() {
  return useQuery({
    queryKey: libraryKeys.summary,
    queryFn: () => apiGet('/api/library/summary', LibrarySummary),
  });
}

/**
 * Delete file in Preview (`DELETE /api/library/videos/:id/file`). Afterwards every library
 * query, the sources (their sizes) and the Activity history refresh.
 */
export function useDeleteVideoFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['library', 'delete-file'],
    mutationFn: (id: number) => apiDelete(`/api/library/videos/${id}/file`),
    onSuccess: () => {
      // Not awaited: Preview closes at once and the grids catch up behind it.
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/**
 * Refreshes the library whenever the number of active downloads changes (a download finished
 * or a new one started), using the badge summary the shell already polls. Call once, in the
 * root layout.
 */
export function useLibraryFollowsDownloads(): void {
  const queryClient = useQueryClient();
  const active = useActivitySummary().data?.activeDownloads;
  const previous = useRef(active);
  useEffect(() => {
    if (active === undefined) return;
    if (previous.current !== undefined && previous.current !== active) {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    }
    previous.current = active;
  }, [active, queryClient]);
}

/** The Artists tab (`GET /api/library/artists`), by name. */
export function useArtists() {
  return useQuery({
    queryKey: libraryKeys.artists,
    queryFn: () => apiGet('/api/library/artists', z.array(ArtistListItem)),
  });
}

/** The Albums tab (`GET /api/library/albums[?artistId=]`). */
export function useAlbums(artistId?: number) {
  return useQuery({
    queryKey: libraryKeys.albums(artistId),
    queryFn: () =>
      apiGet(
        artistId === undefined ? '/api/library/albums' : `/api/library/albums?artistId=${artistId}`,
        z.array(AlbumListItem),
      ),
  });
}

/** The Playlists tab (`GET /api/library/playlists?library=music`), by name. */
export function usePlaylists() {
  return useQuery({
    queryKey: libraryKeys.playlists,
    queryFn: () => apiGet('/api/library/playlists?library=music', z.array(PlaylistListItem)),
  });
}

/**
 * One track (`GET /api/library/tracks/:id`), for Preview. A 404 is not retried; ids below 1
 * never fetch.
 */
export function useTrack(id: number) {
  return useQuery({
    queryKey: libraryKeys.track(id),
    enabled: id > 0,
    queryFn: () => apiGet(`/api/library/tracks/${id}`, TrackListItem),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/** What the Tracks tab lists: the filter text, the filter and the sort. */
export type TrackFilterState = Pick<TrackListQuery, 'filter' | 'sort' | 'dir'> & { q: string };

export function tracksUrl(filter: TrackFilterState, cursor: string | null): string {
  const params = new URLSearchParams({ filter: filter.filter, sort: filter.sort, dir: filter.dir });
  if (filter.q.trim() !== '') params.set('q', filter.q.trim());
  if (cursor) params.set('cursor', cursor);
  return `/api/library/tracks?${params.toString()}`;
}

/**
 * The Tracks tab (`GET /api/library/tracks`), 60 per page; `fetchNextPage` loads the next one
 * while `hasNextPage`. The previous result stays on screen while a new filter or sort loads, so
 * the table does not flash empty on every keystroke.
 */
export function useTracks(filter: TrackFilterState) {
  return useInfiniteQuery({
    queryKey: libraryKeys.tracks(filter),
    queryFn: ({ pageParam }) => apiGet(tracksUrl(filter, pageParam), TrackPage),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}

/** Seeds the single-track cache from a Home tile, so Preview renders without a request. */
export function primeTrack(queryClient: QueryClient, track: TrackListItem): void {
  queryClient.setQueryData(libraryKeys.track(track.id), track);
}

/** Delete file in Preview for a track (`DELETE /api/library/tracks/:id/file`). */
export function useDeleteTrackFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['library', 'delete-file'],
    mutationFn: (id: number) => apiDelete(`/api/library/tracks/${id}/file`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Preview's `<audio>` source for a track, with HTTP Range support. */
export function trackStreamUrl(id: number): string {
  return `/api/library/tracks/${id}/stream`;
}

/** Preview's `<video>` source: the file with HTTP Range support. */
export function videoStreamUrl(id: number): string {
  return `/api/library/videos/${id}/stream`;
}

/** A cached avatar or thumbnail (`/api/artwork/<kind>/<id>`). DTOs already carry these. */
export function artworkUrl(kind: ArtworkKind, id: number): string {
  return artworkPath(kind, id);
}
