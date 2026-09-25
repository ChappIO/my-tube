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
 * `202` when the job was queued (`Rescan queued.`), `409` when one is already queued or running
 * (`A rescan is already running.`); `jobId` is that job in both cases.
 */
export const SystemActionResult = z.object({
  message: z.string(),
  jobId: z.number().int().positive().optional(),
});
export type SystemActionResult = z.infer<typeof SystemActionResult>;

/** How many database backups `CONFIG_DIR/backups` keeps; older ones are removed after a backup. */
export const BACKUP_KEEP = 7;

/** One library's totals: what is on disk now. */
export const LibraryStats = z.object({
  /** Bytes of the items on disk (`file_size_bytes` as the download or the last rescan saw it). */
  sizeBytes: z.number().int().nonnegative(),
  /** Tracks (Music) or videos (Video) on disk. */
  itemCount: z.number().int().nonnegative(),
});
export type LibraryStats = z.infer<typeof LibraryStats>;

/**
 * `GET /api/system/maintenance`: the library totals, the last rescan and the last backup, for
 * Settings → Music / Video (Library → Size) and Settings → Advanced (Data → Last backup).
 * `active` is true while such a job is queued or running (the web polls until it is false).
 */
export const MaintenanceStatus = z.object({
  libraries: z.object({ music: LibraryStats, video: LibraryStats }),
  rescan: z.object({
    active: z.boolean(),
    /** When the last rescan finished (ISO UTC); null before the first one. */
    lastAt: z.iso.datetime().nullable(),
  }),
  backup: z.object({
    active: z.boolean(),
    /** The newest file in `CONFIG_DIR/backups`, null before the first backup. */
    last: z
      .object({
        /** `mytube-2026-09-26T04:00:00Z.sqlite`. */
        file: z.string(),
        /** When it was taken (ISO UTC, from the file name). */
        at: z.iso.datetime(),
        sizeBytes: z.number().int().nonnegative(),
      })
      .nullable(),
    /** How many backups are kept (`BACKUP_KEEP`). */
    keep: z.number().int().positive(),
  }),
});
export type MaintenanceStatus = z.infer<typeof MaintenanceStatus>;
