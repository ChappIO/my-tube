import { z } from 'zod';

/*
 * Every value a user can change in the Settings screen, grouped by the screen's cards.
 *
 * Storage: the API keeps one row per field in the `settings` table, keyed by the dotted path
 * (`general.theme`, `video.keepDays`) with the value as JSON. Rows only exist for values the
 * user changed; everything else comes from the defaults below.
 *
 * Paths of the mounts (`/media/music`, `/media/video`, `/config`) are env, not settings.
 *
 * Adding a setting: add the field with a `.default()` to its group here, rebuild shared, then
 * build the control in the web app. No migration is needed.
 */

/** Theme choice. `system` follows `prefers-color-scheme`. */
export const ThemeChoice = z.enum(['system', 'light', 'dark']);
export type ThemeChoice = z.infer<typeof ThemeChoice>;

/** Choices for "Check for new content", in hours. */
export const CHECK_INTERVAL_HOURS = [1, 2, 6, 12, 24] as const;
/** Bounds for "Downloads at once". */
export const DOWNLOADS_AT_ONCE_MIN = 1;
export const DOWNLOADS_AT_ONCE_MAX = 5;

export const AUDIO_QUALITIES = ['best', '320k', '256k', '192k', '128k'] as const;
export const AUDIO_CONTAINERS = ['m4a', 'mp3', 'opus', 'flac'] as const;
export const VIDEO_QUALITIES = ['best', '2160p', '1440p', '1080p', '720p', '480p'] as const;
export const VIDEO_CONTAINERS = ['mkv', 'mp4', 'webm'] as const;
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug'] as const;

/** A path template: placeholders in braces, `/` separates folders. */
const PathTemplate = z.string().trim().min(1).max(500);

/** Settings → General. */
export const GeneralSettings = z.object({
  theme: ThemeChoice.default('system'),
  /** How often subscribed sources are checked for new content. */
  checkIntervalHours: z.literal(CHECK_INTERVAL_HOURS).default(2),
  /** Worker pool size for downloads. */
  downloadsAtOnce: z
    .number()
    .int()
    .min(DOWNLOADS_AT_ONCE_MIN)
    .max(DOWNLOADS_AT_ONCE_MAX)
    .default(2),
});
export type GeneralSettings = z.infer<typeof GeneralSettings>;

/** Settings → Music. */
export const MusicSettings = z.object({
  /** Handoff "Artist / Album / ## Title". */
  pathTemplate: PathTemplate.default('{artist}/{album}/{track:02} {title}'),
  /** Handoff "best available". */
  audioQuality: z.enum(AUDIO_QUALITIES).default('best'),
  container: z.enum(AUDIO_CONTAINERS).default('m4a'),
  loudnessNormalization: z.boolean().default(false),
  downloadFullAlbums: z.boolean().default(true),
  /** "Embed cover art and tags". */
  embedCoverArt: z.boolean().default(true),
  skipLiveRecordings: z.boolean().default(false),
});
export type MusicSettings = z.infer<typeof MusicSettings>;

/** Settings → Video. `keepDays`, `skipShorts` and `saveThumbnails` are defaults for new channels. */
export const VideoSettings = z.object({
  /** Handoff "Channel / Title (Date)". */
  pathTemplate: PathTemplate.default('{channel}/{title} ({date})'),
  quality: z.enum(VIDEO_QUALITIES).default('1080p'),
  container: z.enum(VIDEO_CONTAINERS).default('mkv'),
  /** Subtitle language codes; empty means no subtitles. */
  subtitleLanguages: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'Use a language code such as en or pt-BR'),
    )
    .max(20)
    .default(['en', 'nl']),
  /** Embed subtitles in the container instead of writing sidecar files. */
  subtitlesEmbedded: z.boolean().default(true),
  /** "Keep videos for N days"; null keeps them forever. */
  keepDays: z.number().int().min(1).max(3650).nullable().default(90),
  skipShorts: z.boolean().default(true),
  /** Sidecar thumbnail, for Plex. */
  saveThumbnails: z.boolean().default(true),
});
export type VideoSettings = z.infer<typeof VideoSettings>;

/** Settings → Advanced → yt-dlp. */
export const YtdlpSettings = z.object({
  autoUpdate: z.boolean().default(true),
  updateIntervalHours: z.number().int().min(1).max(168).default(6),
});
export type YtdlpSettings = z.infer<typeof YtdlpSettings>;

/** Settings → Advanced → Network. null means "none". */
export const NetworkSettings = z.object({
  /** yt-dlp `--limit-rate` value such as `5M` or `500K`. */
  rateLimit: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?[KMG]?$/i, 'Use a rate such as 500K or 5M')
    .nullable()
    .default(null),
  /** Proxy URL passed to yt-dlp, for example `socks5://host:1080`. */
  proxy: z.string().trim().min(1).max(500).nullable().default(null),
  /** Path of a Netscape cookies file inside the container. */
  cookiesFile: z.string().trim().min(1).max(500).nullable().default(null),
});
export type NetworkSettings = z.infer<typeof NetworkSettings>;

/** Settings → Advanced → Data. */
export const DataSettings = z.object({
  logLevel: z.enum(LOG_LEVELS).default('info'),
});
export type DataSettings = z.infer<typeof DataSettings>;

/**
 * All settings. Every field has a default, so `Settings.parse({})` is the fresh-install state.
 * Unknown groups and fields are stripped. This is the `GET /api/settings` response.
 */
export const Settings = z.object({
  general: GeneralSettings.prefault({}),
  music: MusicSettings.prefault({}),
  video: VideoSettings.prefault({}),
  ytdlp: YtdlpSettings.prefault({}),
  network: NetworkSettings.prefault({}),
  data: DataSettings.prefault({}),
});
export type Settings = z.infer<typeof Settings>;

export type SettingsGroup = keyof Settings;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});

/** A partial update: any subset of fields in any subset of groups. */
export type SettingsPatch = { [G in SettingsGroup]?: Partial<Settings[G]> };

/**
 * The patch variant of a group: the same field schemas without their defaults, all optional,
 * unknown fields rejected. (Zod's `.partial()` would fill in defaults for omitted fields.)
 */
function patchGroup(group: z.ZodObject): z.ZodType {
  const shape = Object.fromEntries(
    Object.entries(group.shape).map(([key, field]) => [
      key,
      (field instanceof z.ZodDefault ? field.unwrap() : field).optional(),
    ]),
  );
  return z.strictObject(shape).optional();
}

const settingsPatchSchema = z
  .strictObject(
    Object.fromEntries(
      Object.entries(Settings.shape).map(([key, group]) => [key, patchGroup(group.unwrap())]),
    ),
  )
  .refine(
    (patch) =>
      Object.values(patch).some(
        (group) =>
          typeof group === 'object' &&
          group !== null &&
          Object.values(group).some((value) => value !== undefined),
      ),
    'Change at least one setting',
  );

/**
 * `PATCH /api/settings` body. Only the given fields change. Unknown groups or fields are a 400,
 * and so is a patch that changes nothing.
 *
 * The schema is built from `Settings.shape` at runtime, which loses its static type; the
 * `SettingsPatch` type above is exactly what it accepts.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
export const SettingsPatch = settingsPatchSchema as unknown as z.ZodType<SettingsPatch>;

/** Dotted storage key of a field, as used in the `settings` table (`general.theme`). */
export function settingsKey<G extends SettingsGroup>(group: G, field: keyof Settings[G]): string {
  return `${group}.${String(field)}`;
}
