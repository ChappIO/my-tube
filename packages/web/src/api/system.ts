import { type SystemAction, SystemActionResult, SystemInfo } from '@mytube/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet } from './client';

export const systemInfoQueryKey = ['system', 'info'] as const;

/** `GET /api/system/logs`: a `text/plain` attachment. Navigate to it to download. */
export const SYSTEM_LOGS_URL = '/api/system/logs';

/** Version and mount paths (`GET /api/system/info`). They only change with a restart. */
export function useSystemInfo() {
  return useQuery({
    queryKey: systemInfoQueryKey,
    queryFn: () => apiGet('/api/system/info', SystemInfo),
    staleTime: Infinity,
  });
}

/**
 * The line to show for an action's answer: its `message` when the body carries one (the 501
 * stubs do), otherwise a generic failure.
 */
export async function systemActionMessage(response: Response): Promise<string> {
  const parsed = SystemActionResult.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) return parsed.data.message;
  return response.ok ? 'Done.' : `Failed (${response.status}).`;
}

/**
 * Runs a maintenance action (`POST /api/system/backup` or `/rescan`). Resolves with the line to
 * show under the buttons, success or not: until Stage 7 both answer 501 with
 * `Not implemented until Stage 7`. Rejects only when the request itself fails.
 */
export function useSystemAction() {
  return useMutation({
    mutationKey: ['system', 'action'],
    mutationFn: async (action: SystemAction) => {
      const response = await fetch(`/api/system/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      return { action, ok: response.ok, message: await systemActionMessage(response) };
    },
  });
}
