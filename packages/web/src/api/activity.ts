import { ActivitySummary, HistoryEntry, Job } from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { ApiError, apiGet, apiGetText, apiPost, apiPostEmpty } from './client';

/*
 * The Activity screen and the sidebar badge. Polling, not push (architecture skill): the screen
 * polls the queue every 2 s and the history every 5 s while it is mounted; the badge polls the
 * summary every 30 s, every 5 s while downloads are active.
 */

export const queueQueryKey = ['activity', 'queue'] as const;
export const historyQueryKey = ['activity', 'history'] as const;
export const summaryQueryKey = ['activity', 'summary'] as const;

export const QUEUE_POLL_MS = 2_000;
export const HISTORY_POLL_MS = 5_000;
export const SUMMARY_POLL_MS = 30_000;
export const SUMMARY_ACTIVE_POLL_MS = 5_000;

/** Entries the History section shows. */
export const HISTORY_LIMIT = 100;

const JobList = z.array(Job);
const HistoryList = z.array(HistoryEntry);

/** `GET /api/activity/queue`: running, queued, then recently failed jobs. */
export function useQueue() {
  return useQuery({
    queryKey: queueQueryKey,
    queryFn: () => apiGet('/api/activity/queue', JobList),
    refetchInterval: QUEUE_POLL_MS,
  });
}

/** `GET /api/activity/history`, newest first. */
export function useHistory() {
  return useQuery({
    queryKey: historyQueryKey,
    queryFn: () => apiGet(`/api/activity/history?limit=${HISTORY_LIMIT}`, HistoryList),
    refetchInterval: HISTORY_POLL_MS,
  });
}

/** The poll interval of the badge summary: faster while downloads are active. */
export function summaryPollMs(summary: ActivitySummary | undefined): number {
  return summary && summary.activeDownloads > 0 ? SUMMARY_ACTIVE_POLL_MS : SUMMARY_POLL_MS;
}

/** `GET /api/activity/summary`: `activeDownloads` is the Activity badge. */
export function useActivitySummary() {
  return useQuery({
    queryKey: summaryQueryKey,
    queryFn: () => apiGet('/api/activity/summary', ActivitySummary),
    refetchInterval: (query) => summaryPollMs(query.state.data),
  });
}

/** Refetches every Activity query after an action, so the screen and the badge follow at once. */
function useInvalidateActivity() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['activity'] });
}

/** `POST /api/jobs/:id/cancel`: cancels a queued or running job, dismisses a failed one. */
export function useCancelJob() {
  const invalidate = useInvalidateActivity();
  return useMutation({
    mutationKey: ['activity', 'cancel'],
    mutationFn: (id: number) => apiPostEmpty(`/api/jobs/${id}/cancel`),
    onSettled: invalidate,
  });
}

/** `POST /api/jobs/:id/retry`: runs a failed job again from scratch. */
export function useRetryJob() {
  const invalidate = useInvalidateActivity();
  return useMutation({
    mutationKey: ['activity', 'retry'],
    mutationFn: (id: number) => apiPost(`/api/jobs/${id}/retry`, undefined, Job),
    onSettled: invalidate,
  });
}

/** `POST /api/sync/check-all`: checks every subscribed source now. */
export function useCheckAll() {
  const invalidate = useInvalidateActivity();
  return useMutation({
    mutationKey: ['activity', 'check-all'],
    mutationFn: () => apiPost('/api/sync/check-all', undefined, JobList),
    onSettled: invalidate,
  });
}

/** The job's log (`text/plain`, inline). */
export function jobLogUrl(id: number): string {
  return `/api/jobs/${id}/log`;
}

/** The job's log as an attachment (`job-<id>.log`): the log viewer's Download. */
export function jobLogDownloadUrl(id: number): string {
  return `${jobLogUrl(id)}?download=1`;
}

const notFound = (error: Error) => error instanceof ApiError && error.status === 404;

/** `GET /api/jobs/:id`: any job, for the log viewer's header when it is not in the queue. */
export function jobQuery(id: number) {
  return {
    queryKey: ['activity', 'job', id] as const,
    queryFn: () => apiGet(`/api/jobs/${id}`, Job),
    retry: (count: number, error: Error) => !notFound(error) && count < 2,
  };
}

/**
 * The job the log viewer describes: its queue row while it is in the queue (polled with the
 * queue, so the header follows the download), otherwise `GET /api/jobs/:id` once (a finished
 * job no longer changes). A job that leaves the queue is fetched then, with its final state.
 */
export function useJobDetails(id: number): {
  job: Job | undefined;
  isPending: boolean;
  error: Error | null;
} {
  const queue = useQueue();
  const queued = queue.data?.find((job) => job.id === id);
  const fetched = useQuery({ ...jobQuery(id), enabled: queued === undefined && queue.isFetched });
  if (queued) return { job: queued, isPending: false, error: null };
  return {
    job: fetched.data,
    isPending: fetched.data === undefined && !fetched.isError,
    error: fetched.error,
  };
}

/** A live job log is fetched again this often (the queue's own pace). */
export const JOB_LOG_POLL_MS = 2_000;

/**
 * The query of a job's log: polled every 2 s while `live` (the job is running), fetched once
 * otherwise (a failed job's log no longer changes). A 404 (no log yet) is not retried.
 */
export function jobLogQuery(id: number, { live }: { live: boolean }) {
  return {
    queryKey: ['activity', 'job-log', id] as const,
    queryFn: () => apiGetText(jobLogUrl(id)),
    refetchInterval: live ? JOB_LOG_POLL_MS : (false as const),
    retry: (count: number, error: Error) => !notFound(error) && count < 2,
  };
}

/**
 * `GET /api/jobs/:id/log` for the log viewer; see `jobLogQuery`. When `live` turns off (the job
 * finished or failed) the log is fetched once more, so its last lines are not missed.
 */
export function useJobLog(id: number, options: { live: boolean }) {
  const query = useQuery(jobLogQuery(id, options));
  const wasLive = useRef(options.live);
  const { refetch } = query;
  useEffect(() => {
    if (wasLive.current && !options.live) void refetch();
    wasLive.current = options.live;
  }, [options.live, refetch]);
  return query;
}
