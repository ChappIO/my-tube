import { z } from 'zod';
import { ArtworkPath } from './artwork.js';
import { Video } from './items.js';

/*
 * The library read models (`/api/library/*`): the Videos tab and channel page grid, the Home
 * feed with its stats, the Video header summary, and what Preview needs to play a file.
 */

// ---------------------------------------------------------------------------------------
// Media types. Shared so the API's Content-Type and the web's `canPlayType` check agree.
// ---------------------------------------------------------------------------------------

/** Content type per video container. Browsers play mp4 and webm; mkv mostly not. */
export const VIDEO_MIME_TYPES: Readonly<Record<string, string>> = {
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/** The content type of a video file by its extension, or null for an unknown one. */
export function videoMimeType(path: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return (match && VIDEO_MIME_TYPES[match[1]!.toLowerCase()]) ?? null;
}

// ---------------------------------------------------------------------------------------
// Videos.
// ---------------------------------------------------------------------------------------

/** `status` filter of the videos list: one item status, or `all`. */
export const VIDEO_LIST_STATUSES = ['on_disk', 'wanted', 'skipped', 'all'] as const;
export const VideoListStatus = z.enum(VIDEO_LIST_STATUSES);
export type VideoListStatus = z.infer<typeof VideoListStatus>;

/** Sort of the videos list, newest first: by upload date or by download time. */
export const VIDEO_SORTS = ['published', 'downloaded'] as const;
export const VideoSort = z.enum(VIDEO_SORTS);
export type VideoSort = z.infer<typeof VideoSort>;

export const VIDEO_PAGE_SIZE = 60;
export const VIDEO_PAGE_MAX = 200;

/** `GET /api/library/videos` query. Other parameters are ignored. */
export const VideoListQuery = z.object({
  /** Only videos of this `channels` row. */
  channelId: z.coerce.number().int().positive().optional(),
  /** A source's videos: the ones it listed first (`videos.source_id`) and those of its channel. */
  sourceId: z.coerce.number().int().positive().optional(),
  status: VideoListStatus.default('on_disk'),
  sort: VideoSort.default('published'),
  limit: z.coerce.number().int().min(1).max(VIDEO_PAGE_MAX).default(VIDEO_PAGE_SIZE),
  /** `nextCursor` of the previous page. Opaque. */
  cursor: z.string().min(1).max(500).optional(),
});
export type VideoListQuery = z.infer<typeof VideoListQuery>;

/** The channel of a listed video, for the chin link and avatars. */
export const VideoChannel = z.object({
  /** The `channels` row id. */
  id: z.number().int().positive(),
  name: z.string(),
  avatarUrl: ArtworkPath.nullable(),
  /** The source that added this channel, when it was added as one: the channel page's id. */
  sourceId: z.number().int().positive().nullable(),
});
export type VideoChannel = z.infer<typeof VideoChannel>;

/** One video in a library list: the `Video` DTO plus its channel and what Preview needs. */
export const VideoListItem = Video.extend({
  /** The cached thumbnail (`/api/artwork/video/<id>`): the sidecar `.jpg` when on disk. */
  thumbnailUrl: ArtworkPath.nullable(),
  channel: VideoChannel,
  /** Content type of the file on disk (`video/mp4`, `video/x-matroska`), null without one. */
  mimeType: z.string().nullable(),
});
export type VideoListItem = z.infer<typeof VideoListItem>;

/** `GET /api/library/videos` response. `nextCursor` is null on the last page. */
export const VideoPage = z.object({
  items: z.array(VideoListItem),
  nextCursor: z.string().nullable(),
});
export type VideoPage = z.infer<typeof VideoPage>;

// ---------------------------------------------------------------------------------------
// Home.
// ---------------------------------------------------------------------------------------

export const HOME_DAYS_DEFAULT = 14;
/** At most this many items across all day groups. */
export const HOME_ITEM_LIMIT = 200;

/** `GET /api/library/home` query. */
export const HomeQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(HOME_DAYS_DEFAULT),
  /** IANA time zone the days are counted in (the browser's); the server's when absent. */
  tz: z
    .string()
    .max(100)
    .refine((zone) => {
      try {
        return (
          new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== ''
        );
      } catch {
        return false;
      }
    }, 'Unknown time zone')
    .optional(),
});
export type HomeQuery = z.infer<typeof HomeQuery>;

/** A video on Home. Music items join this union in Stage 6 (`kind: 'track'`). */
export const HomeVideoItem = VideoListItem.extend({ kind: z.literal('video') });
export type HomeVideoItem = z.infer<typeof HomeVideoItem>;

export const HomeItem = z.discriminatedUnion('kind', [HomeVideoItem]);
export type HomeItem = z.infer<typeof HomeItem>;

/** The three stat cards. */
export const HomeStats = z.object({
  /** Download jobs queued or running (the same count as the Activity badge). */
  activeDownloads: z.number().int().nonnegative(),
  /** History rows of finished downloads (`done`), ever. */
  downloadedAllTime: z.number().int().nonnegative(),
  /** Bytes on disk over both libraries. */
  librarySizeBytes: z.number().int().nonnegative(),
});
export type HomeStats = z.infer<typeof HomeStats>;

/** One day of downloads, newest first. `day` is the local date (`YYYY-MM-DD`). */
export const HomeGroup = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(HomeItem),
});
export type HomeGroup = z.infer<typeof HomeGroup>;

/** `GET /api/library/home` response. */
export const HomeFeed = z.object({
  stats: HomeStats,
  groups: z.array(HomeGroup),
});
export type HomeFeed = z.infer<typeof HomeFeed>;

// ---------------------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------------------

/** `GET /api/library/summary`: the Video header sub (`4 channels · 1 playlist · 368 videos · 130 GB`). */
export const LibrarySummary = z.object({
  videos: z.object({
    /** Channel sources in the Video library. */
    channels: z.number().int().nonnegative(),
    /** Playlist sources in the Video library. */
    playlists: z.number().int().nonnegative(),
    /** Videos on disk. */
    videos: z.number().int().nonnegative(),
    /** Bytes of the videos on disk. */
    sizeBytes: z.number().int().nonnegative(),
  }),
});
export type LibrarySummary = z.infer<typeof LibrarySummary>;
