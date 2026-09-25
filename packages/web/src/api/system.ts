import {
  MaintenanceStatus,
  type SystemAction,
  SystemActionResult,
  SystemInfo,
} from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiGet } from './client';

export const systemInfoQueryKey = ['system', 'info'] as const;
export const maintenanceQueryKey = ['system', 'maintenance'] as const;

/** How often the maintenance status is polled while a rescan or backup is queued or running. */
export const MAINTENANCE_POLL_MS = 2000;

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
 * Library totals, the last rescan and the last backup (`GET /api/system/maintenance`), for the
 * Library → Size rows and Data → Last backup. Polled every 2 s while a rescan or backup is
 * queued or running; when a rescan finishes, the library and source caches are refreshed, since
 * it may have marked items missing or on disk again.
 */
export function useMaintenanceStatus() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: maintenanceQueryKey,
    queryFn: () => apiGet('/api/system/maintenance', MaintenanceStatus),
    refetchInterval: (current) =>
      current.state.data && isMaintenanceActive(current.state.data) ? MAINTENANCE_POLL_MS : false,
  });
  const rescanning = query.data?.rescan.active;
  const wasRescanning = useRef(rescanning);
  useEffect(() => {
    if (wasRescanning.current && rescanning === false) {
      void queryClient.invalidateQueries({ queryKey: ['library'] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
    }
    wasRescanning.current = rescanning;
  }, [rescanning, queryClient]);
  return query;
}

/** A rescan or backup is queued or running. */
export function isMaintenanceActive(status: MaintenanceStatus): boolean {
  return status.rescan.active || status.backup.active;
}

/**
 * The line to show for an action's answer: its `message` (`Backup queued.`, `A rescan is
 * already running.`), otherwise a generic one by status.
 */
export async function systemActionMessage(response: Response): Promise<string> {
  const parsed = SystemActionResult.safeParse(await response.json().catch(() => undefined));
  if (parsed.success) return parsed.data.message;
  return response.ok ? 'Done.' : `Failed (${response.status}).`;
}

/**
 * Runs a maintenance action (`POST /api/system/backup` or `/rescan`: 202 queued, 409 already
 * queued or running). Resolves with the line to show under the buttons, success or not, once the
 * maintenance status has been refetched (so it already says the job is active). Rejects only
 * when the request itself fails.
 */
export function useSystemAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['system', 'action'],
    mutationFn: async (action: SystemAction) => {
      const response = await fetch(`/api/system/${action}`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      return { action, ok: response.ok, message: await systemActionMessage(response) };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: maintenanceQueryKey }),
  });
}
