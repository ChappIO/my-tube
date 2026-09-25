import {
  type ArtworkKind,
  HomeFeed,
  LibrarySummary,
  type VideoListQuery,
  VideoListItem,
  VideoPage,
  artworkPath,
} from '@mytube/shared';
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useActivitySummary } from './activity';
import { ApiError, apiDelete, apiGet } from './client';

/*
 * The library read models (`/api/library/*`, backend skill "Library"): the videos grid, Home,
 * the Video header summary, one video for Preview and Delete file. Everything starts with
 * `['library']`, so a finished download or a deletion refreshes all of it at once.
 */

/** The filter of a videos grid (`GET /api/library/videos`); the cursor is the page param. */
export type VideoFilter = Partial<Omit<VideoListQuery, 'cursor'>>;

export const libraryKeys = {
  all: ['library'] as const,
  videos: (filter: VideoFilter) => ['library', 'videos', filter] as const,
  video: (id: number) => ['library', 'video', id] as const,
  home: ['library', 'home'] as const,
  summary: ['library', 'summary'] as const,
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

/** Preview's `<video>` source: the file with HTTP Range support. */
export function videoStreamUrl(id: number): string {
  return `/api/library/videos/${id}/stream`;
}

/** A cached avatar or thumbnail (`/api/artwork/<kind>/<id>`). DTOs already carry these. */
export function artworkUrl(kind: ArtworkKind, id: number): string {
  return artworkPath(kind, id);
}
