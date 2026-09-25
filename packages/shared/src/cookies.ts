import { z } from 'zod';

/** File name of the cookies file MyTube manages in `CONFIG_DIR` (`/config/cookies.txt`). */
export const MANAGED_COOKIES_FILE = 'cookies.txt';

/** The largest cookies file `PUT /api/system/cookies` accepts (1 MiB). Real exports are ~10 KB. */
export const COOKIES_MAX_BYTES = 1024 * 1024;

/**
 * `GET`, `PUT` and `DELETE /api/system/cookies`: what yt-dlp's `--cookies` file is, described
 * without its contents. Cookie names and values are never part of it.
 */
export const CookiesStatus = z.object({
  /**
   * True when `network.cookiesFile` is the file MyTube manages (`CONFIG_DIR/cookies.txt`,
   * uploaded or pasted in Settings); false when it is unset or a path the user set by hand.
   */
  managed: z.boolean(),
  /** `network.cookiesFile`: the path passed to yt-dlp, null when no cookies are used. */
  path: z.string().nullable(),
  /** Cookie lines in the file; null when there is no file or it cannot be read. */
  cookieCount: z.number().int().nonnegative().nullable(),
  /** The sites the cookies are for, most cookies first, at most a few (`youtube.com`). */
  domains: z.array(z.string()),
  /** When the file last changed (ISO UTC). yt-dlp writes refreshed cookies back after a run. */
  updatedAt: z.iso.datetime().nullable(),
  /** The earliest expiry among the cookies that have one (ISO UTC); null when none do. */
  expiresSoonest: z.iso.datetime().nullable(),
});
export type CookiesStatus = z.infer<typeof CookiesStatus>;
