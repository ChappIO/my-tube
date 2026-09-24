import { z } from 'zod';

/**
 * Where the yt-dlp binary manager is:
 * - `not_installed`: no binary and no install running yet (the moment before the first
 *   install starts).
 * - `installing`: first install in progress, release lookup included.
 * - `up_to_date`: installed, and the last check found nothing newer (or no check yet).
 * - `update_available`: installed, and GitHub has a newer release.
 * - `updating`: replacing an installed binary.
 * - `error`: the last check, install or update failed; see `error`. `installed` tells whether
 *   a working binary is still there (a failed update keeps the old one). An unsupported
 *   platform or an unreachable GitHub on first boot shows up here too.
 */
export const YtdlpState = z.enum([
  'not_installed',
  'installing',
  'up_to_date',
  'update_available',
  'updating',
  'error',
]);
export type YtdlpState = z.infer<typeof YtdlpState>;

/** `GET /api/ytdlp/status`, and the response of `POST /api/ytdlp/check` and `/update`. */
export const YtdlpStatus = z.object({
  installed: z.boolean(),
  /** `yt-dlp --version` of the installed binary, such as `2026.09.22`. */
  installedVersion: z.string().nullable(),
  /** Newest release tag seen on GitHub at the last check. */
  latestVersion: z.string().nullable(),
  /** ISO 8601 UTC. */
  lastCheckedAt: z.string().nullable(),
  /** ISO 8601 UTC of the last install or update. */
  lastUpdatedAt: z.string().nullable(),
  /** `ytdlp.autoUpdate` from settings. */
  autoUpdate: z.boolean(),
  /** `ytdlp.updateIntervalHours` from settings. */
  updateIntervalHours: z.number(),
  state: YtdlpState,
  /** The last failure, cleared by the next successful check or install. */
  error: z.string().nullable(),
});
export type YtdlpStatus = z.infer<typeof YtdlpStatus>;
