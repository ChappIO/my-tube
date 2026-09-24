import { YtdlpStatus, type YtdlpState } from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from './client';

export const ytdlpStatusQueryKey = ['ytdlp', 'status'] as const;

/** How often the status is refetched while a component using it is mounted. */
const POLL_MS = 30_000;
/** Faster while an install or update runs, so the footer settles soon after it finishes. */
const BUSY_POLL_MS = 3_000;

/** Short labels for the sidebar footer and the Advanced yt-dlp card. */
export const YTDLP_STATE_LABELS: Record<YtdlpState, string> = {
  not_installed: 'not installed',
  installing: 'installing…',
  up_to_date: 'up to date',
  update_available: 'update available',
  updating: 'updating…',
  error: 'error',
};

export function isYtdlpBusy(state: YtdlpState): boolean {
  return state === 'installing' || state === 'updating';
}

/** `up to date · auto-update on`: the footer's second line and the card's tail. */
export function ytdlpSummary(status: YtdlpStatus): string {
  return `${YTDLP_STATE_LABELS[status.state]} · auto-update ${status.autoUpdate ? 'on' : 'off'}`;
}

/** `GET /api/ytdlp/status`, polled every 30 seconds (every 3 while installing or updating). */
export function useYtdlpStatus() {
  return useQuery({
    queryKey: ytdlpStatusQueryKey,
    queryFn: () => apiGet('/api/ytdlp/status', YtdlpStatus),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state && isYtdlpBusy(state) ? BUSY_POLL_MS : POLL_MS;
    },
  });
}

export type YtdlpAction = 'check' | 'update';

/**
 * `POST /api/ytdlp/check` (look up the latest release) or `POST /api/ytdlp/update` (check and
 * install when newer). The response is the new status and replaces the cached one. Failures of
 * the lookup or install come back as a status with `state: 'error'`, not as a rejected mutation.
 */
export function useYtdlpAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['ytdlp', 'action'],
    mutationFn: (action: YtdlpAction) => apiPost(`/api/ytdlp/${action}`, undefined, YtdlpStatus),
    onSuccess: (status) => queryClient.setQueryData(ytdlpStatusQueryKey, status),
    onError: () => queryClient.invalidateQueries({ queryKey: ytdlpStatusQueryKey }),
  });
}
