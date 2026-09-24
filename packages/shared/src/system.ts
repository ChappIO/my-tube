import { z } from 'zod';

/**
 * `GET /api/system/info`: build and mount facts the Settings screen shows read-only. The paths
 * come from env (`CONFIG_DIR`, `MUSIC_DIR`, `VIDEO_DIR`), never from settings: they are container
 * mounts and change in the Docker configuration.
 */
export const SystemInfo = z.object({
  /** `APP_VERSION`, `dev` outside a release image. */
  version: z.string(),
  /** Absolute path of the config mount (database, settings, yt-dlp), `/config` in the image. */
  configDir: z.string(),
  /** Absolute path of the music library mount, `/media/music` in the image. */
  musicDir: z.string(),
  /** Absolute path of the video library mount, `/media/video` in the image. */
  videoDir: z.string(),
  /** Node's `process.platform` and `process.arch`, for example `linux x64`. */
  platform: z.string(),
});
export type SystemInfo = z.infer<typeof SystemInfo>;

/** Maintenance actions behind `POST /api/system/<action>` (Settings → Advanced → Data). */
export const SYSTEM_ACTIONS = ['backup', 'rescan'] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

/**
 * Body of a `POST /api/system/<action>` answer, success or failure: one line for the user.
 * Until Stage 7 both actions answer `501` with `Not implemented until Stage 7`.
 */
export const SystemActionResult = z.object({ message: z.string() });
export type SystemActionResult = z.infer<typeof SystemActionResult>;
