import { CookiesStatus } from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '../format';
import { apiDeleteJson, apiGet, apiPutText } from './client';
import { settingsQueryKey } from './settings';

export const cookiesQueryKey = ['system', 'cookies'] as const;

const COOKIES_PATH = '/api/system/cookies';

/** What yt-dlp's cookies file is (`GET /api/system/cookies`): count, sites, dates, never contents. */
export function useCookiesStatus() {
  return useQuery({
    queryKey: cookiesQueryKey,
    queryFn: () => apiGet(COOKIES_PATH, CookiesStatus),
  });
}

/** Sends a cookies file (a picked file or pasted text) as `text/plain` (`PUT /api/system/cookies`). */
export function putCookies(body: string | Blob): Promise<CookiesStatus> {
  return apiPutText(COOKIES_PATH, body, CookiesStatus);
}

/** Removes the managed cookies file (`DELETE /api/system/cookies`). */
export function deleteCookies(): Promise<CookiesStatus> {
  return apiDeleteJson(COOKIES_PATH, CookiesStatus);
}

/** Upload a picked file or pasted text, or remove the managed file. */
export type CookiesAction = { upload: string | Blob } | { remove: true };

/** Runs one `CookiesAction` against the API (the mutation function of `useCookiesAction`). */
export function runCookiesAction(action: CookiesAction): Promise<CookiesStatus> {
  return 'upload' in action ? putCookies(action.upload) : deleteCookies();
}

/**
 * Stores or removes the cookies file: `mutate({ upload: file | text })` or
 * `mutate({ remove: true })`. The answer replaces the cached status, and the settings are
 * refetched because `network.cookiesFile` changes with it.
 */
export function useCookiesAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['system', 'cookies', 'action'],
    mutationFn: runCookiesAction,
    onSuccess: (status) => {
      queryClient.setQueryData(cookiesQueryKey, status);
      return queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });
}

/**
 * The Cookies row's value: `not set`, the path of a file set by hand, or for the managed file
 * `12 cookies · youtube.com, google.com · updated 2 h ago` (`no file` when it is gone).
 */
export function cookiesValueText(status: CookiesStatus, now: number = Date.now()): string {
  if (status.path === null) return 'not set';
  if (!status.managed) return status.path;
  if (status.cookieCount === null) return 'no file';
  const parts = [`${status.cookieCount} ${status.cookieCount === 1 ? 'cookie' : 'cookies'}`];
  if (status.domains.length > 0) parts.push(status.domains.join(', '));
  if (status.updatedAt) parts.push(`updated ${relativeTime(status.updatedAt, now)}`);
  return parts.join(' · ');
}
