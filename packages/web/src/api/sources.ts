import {
  type CreateSource,
  type Library,
  type Matcher,
  ResolvedSource,
  RulesPreview,
  Source,
  SourceConflict,
  type UpdateSource,
} from '@mytube/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from './client';

/**
 * Query keys. Everything starts with `['sources']`, so invalidating that prefix refreshes every
 * list and every single source.
 */
export const sourceKeys = {
  all: ['sources'] as const,
  lists: ['sources', 'list'] as const,
  list: (library?: Library) => ['sources', 'list', library ?? 'all'] as const,
  detail: (id: number) => ['sources', 'detail', id] as const,
  preview: (id: number, matcher: Matcher | undefined) =>
    ['sources', 'preview', id, JSON.stringify(matcher ?? null)] as const,
};

const SourceList = z.array(Source);
const subscribeMutationKey = ['sources', 'subscribed'] as const;

/** Sources, newest first (`GET /api/sources[?library=]`). */
export function useSources(library?: Library) {
  return useQuery({
    queryKey: sourceKeys.list(library),
    queryFn: () => apiGet(library ? `/api/sources?library=${library}` : '/api/sources', SourceList),
  });
}

/**
 * One source (`GET /api/sources/:id`). A 404 is an `ApiError` with `status` 404, not retried.
 * Ids below 1 (an unparsable route param) never fetch.
 */
export function useSource(id: number) {
  return useQuery({
    queryKey: sourceKeys.detail(id),
    enabled: id > 0,
    queryFn: () => apiGet(`/api/sources/${id}`, Source),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/**
 * Resolves a pasted link (`POST /api/sources/resolve`). A mutation because it is triggered by
 * typing and must not be cached: the Add modal calls it per link and ignores answers for links
 * that are no longer in the box. 400 (not a supported link) and 502 (yt-dlp failed) reject with
 * an `ApiError`; read them with `apiErrorMessage`.
 */
export function useResolveSource() {
  return useMutation({
    mutationKey: ['sources', 'resolve'],
    mutationFn: (url: string) => apiPost('/api/sources/resolve', { url }, ResolvedSource),
  });
}

/** The existing source's id from a 409 on create, or undefined for any other error. */
export function conflictSourceId(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const parsed = SourceConflict.safeParse(error.json());
  return parsed.success ? parsed.data.sourceId : undefined;
}

/** Adds a source (`POST /api/sources`) and refreshes the lists. 409: see `conflictSourceId`. */
export function useCreateSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSource) => apiPost('/api/sources', body, Source),
    onSuccess: (source) => {
      queryClient.setQueryData(sourceKeys.detail(source.id), source);
      void queryClient.invalidateQueries({ queryKey: sourceKeys.lists });
    },
  });
}

/** Replaces one source in every cached list and in its own cache entry. */
function writeSource(queryClient: QueryClient, source: Source): void {
  queryClient.setQueriesData<Source[]>({ queryKey: sourceKeys.lists }, (list) =>
    list?.map((item) => (item.id === source.id ? source : item)),
  );
  queryClient.setQueryData(sourceKeys.detail(source.id), source);
}

/**
 * Changes rules, options or the name (`PATCH /api/sources/:id`); the answer updates every
 * cache. A rules change queues a revalidation, so the Activity queue is refreshed too.
 */
export function useUpdateSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateSource }) =>
      apiPatch(`/api/sources/${id}`, patch, Source),
    onSuccess: (source, { patch }) => {
      writeSource(queryClient, source);
      if (patch.matcher) void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/**
 * What saving `matcher` would remove from the source's files on disk
 * (`POST /api/sources/:id/rules/preview`). A query keyed by the tree, so going back to an
 * earlier tree answers from the cache; no request while `matcher` is undefined.
 */
export function useRulesPreview(id: number, matcher: Matcher | undefined) {
  return useQuery({
    queryKey: sourceKeys.preview(id, matcher),
    enabled: matcher !== undefined,
    queryFn: () => apiPost(`/api/sources/${id}/rules/preview`, { matcher }, RulesPreview),
    staleTime: 10_000,
  });
}

type SourceSnapshot = [readonly unknown[], Source | Source[] | undefined][];

/**
 * The bell (`PATCH /api/sources/:id/subscribed`). Optimistic: every cached list and the single
 * source flip at once, so the Channels row and the channel page always agree, and a failure
 * puts the previous state back. With several toggles in flight only the last one settles the
 * caches from the server's answer.
 */
export function useSetSubscribed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: subscribeMutationKey,
    mutationFn: ({ id, subscribed }: { id: number; subscribed: boolean }) =>
      apiPatch(`/api/sources/${id}/subscribed`, { subscribed }, Source),
    onMutate: async ({ id, subscribed }) => {
      await queryClient.cancelQueries({ queryKey: sourceKeys.all });
      const snapshot: SourceSnapshot = [
        ...queryClient.getQueriesData<Source[]>({ queryKey: sourceKeys.lists }),
        [sourceKeys.detail(id), queryClient.getQueryData<Source>(sourceKeys.detail(id))],
      ];
      queryClient.setQueriesData<Source[]>({ queryKey: sourceKeys.lists }, (list) =>
        list?.map((item) => (item.id === id ? { ...item, subscribed } : item)),
      );
      queryClient.setQueryData<Source>(sourceKeys.detail(id), (source) =>
        source ? { ...source, subscribed } : source,
      );
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (queryClient.isMutating({ mutationKey: subscribeMutationKey }) > 1) return;
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      void queryClient.invalidateQueries({ queryKey: sourceKeys.all });
    },
    onSuccess: (source) => {
      if (queryClient.isMutating({ mutationKey: subscribeMutationKey }) > 1) return;
      writeSource(queryClient, source);
    },
  });
}

/**
 * Removes a source (`DELETE /api/sources/:id`). Files stay on disk. Drops it from the cached
 * lists; the single-source entry is only marked stale, so a page still showing it does not
 * refetch into a 404 before it navigates away.
 */
export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/api/sources/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueriesData<Source[]>({ queryKey: sourceKeys.lists }, (list) =>
        list?.filter((item) => item.id !== id),
      );
      void queryClient.invalidateQueries({ queryKey: sourceKeys.lists });
      void queryClient.invalidateQueries({ queryKey: sourceKeys.detail(id), refetchType: 'none' });
    },
  });
}
