import { FetchSubtitlesResult, SubtitlesStatus } from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client';

/*
 * Subtitle jobs (backend skill "Subtitles"): Settings → Video shows how many videos on disk
 * still lack a run with the current languages and queues them.
 */

export const subtitlesStatusQueryKey = ['subtitles', 'status'] as const;

/** How often the status is polled while subtitle jobs are queued or running. */
export const SUBTITLES_POLL_MS = 5_000;

/** `GET /api/subtitles/status`; polled while jobs are active, so the count follows them. */
export function useSubtitlesStatus() {
  return useQuery({
    queryKey: subtitlesStatusQueryKey,
    queryFn: () => apiGet('/api/subtitles/status', SubtitlesStatus),
    refetchInterval: (current) =>
      current.state.data && current.state.data.queued > 0 ? SUBTITLES_POLL_MS : false,
  });
}

/** `POST /api/subtitles/fetch-missing` (202 `{ queued }`), then the status and the queue refresh. */
export function useFetchSubtitles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['subtitles', 'fetch-missing'],
    mutationFn: () => apiPost('/api/subtitles/fetch-missing', {}, FetchSubtitlesResult),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: subtitlesStatusQueryKey });
      await queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
