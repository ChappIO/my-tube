import { z } from 'zod';
import { ArtworkPath } from './artwork.js';
import { Track, Video } from './items.js';

/*
 * The library read models (`/api/library/*`): the Videos tab and channel page grid, the Music
 * tabs (artists, albums, playlists), the Home feed with its stats, the header summaries, and
 * what Preview needs to play a file.
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

/** Content type per audio container. Browsers play m4a, mp3, opus (ogg) and flac. */
export const AUDIO_MIME_TYPES: Readonly<Record<string, string>> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  opus: 'audio/ogg; codecs=opus',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
};

/** The content type of an audio file by its extension, or null for an unknown one. */
export function audioMimeType(path: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return (match && AUDIO_MIME_TYPES[match[1]!.toLowerCase()]) ?? null;
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
// Music: tracks, artists, albums, playlists.
// ---------------------------------------------------------------------------------------

/** The artist of a listed track or album. */
export const TrackArtist = z.object({
  /** The `artists` row id. */
  id: z.number().int().positive(),
  name: z.string(),
  avatarUrl: ArtworkPath.nullable(),
  /** The source that added this artist, when it was added as one. */
  sourceId: z.number().int().positive().nullable(),
});
export type TrackArtist = z.infer<typeof TrackArtist>;

/** The album of a listed track. */
export const TrackAlbum = z.object({
  /** The `albums` row id. */
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().nullable(),
  coverUrl: ArtworkPath.nullable(),
});
export type TrackAlbum = z.infer<typeof TrackAlbum>;

/** One track with its artist, album and what Preview needs (`GET /api/library/tracks/:id`). */
export const TrackListItem = Track.extend({
  /** The album cover when the album has one, else the track's own thumbnail; both cached. */
  coverUrl: ArtworkPath.nullable(),
  artist: TrackArtist,
  album: TrackAlbum.nullable(),
  /** Content type of the file on disk (`audio/mp4`), null without one. */
  mimeType: z.string().nullable(),
});
export type TrackListItem = z.infer<typeof TrackListItem>;

// ---------------------------------------------------------------------------------------
// Tracks tab.
// ---------------------------------------------------------------------------------------

/**
 * The Tracks tab filters: every track in the library, the ones not on disk (known but not on
 * disk: wanted, downloading or missing), or the ones downloaded in the last `RECENT_TRACK_DAYS`.
 */
export const TRACK_FILTERS = ['all', 'missing', 'recent'] as const;
export const TrackFilter = z.enum(TRACK_FILTERS);
export type TrackFilter = z.infer<typeof TrackFilter>;

/** "Recent" is the last 30 days (the handoff's prototype used the current month). */
export const RECENT_TRACK_DAYS = 30;

/** The sortable columns of the Tracks table; `added` is the download time. */
export const TRACK_SORTS = ['title', 'artist', 'album', 'length', 'added'] as const;
export const TrackSort = z.enum(TRACK_SORTS);
export type TrackSort = z.infer<typeof TrackSort>;

export const SORT_DIRS = ['asc', 'desc'] as const;
export const SortDir = z.enum(SORT_DIRS);
export type SortDir = z.infer<typeof SortDir>;

/** The Tracks tab opens on the newest downloads first. */
export const DEFAULT_TRACK_SORT: TrackSort = 'added';
export const DEFAULT_TRACK_DIR: SortDir = 'desc';

export const TRACK_PAGE_SIZE = 60;
export const TRACK_PAGE_MAX = 200;
/** The filter text is at most this long. */
export const TRACK_QUERY_MAX = 200;

/**
 * `GET /api/library/tracks` query. `q` matches title, artist name and album title as a
 * case- and accent-insensitive substring. Rows without the sort value (no album, no length,
 * never downloaded) sort last in both directions.
 */
export const TrackListQuery = z.object({
  q: z.string().trim().max(TRACK_QUERY_MAX).optional(),
  filter: TrackFilter.default('all'),
  sort: TrackSort.default(DEFAULT_TRACK_SORT),
  dir: SortDir.default(DEFAULT_TRACK_DIR),
  limit: z.coerce.number().int().min(1).max(TRACK_PAGE_MAX).default(TRACK_PAGE_SIZE),
  /** `nextCursor` of the previous page, for the same `q`, filter and sort. Opaque. */
  cursor: z.string().min(1).max(1000).optional(),
});
export type TrackListQuery = z.infer<typeof TrackListQuery>;

/**
 * `GET /api/library/tracks` response. `total` counts the tracks matching the filter and `q`,
 * `libraryTotal` every track in the library (the toolbar's `17 of 42 tracks`). `nextCursor` is
 * null on the last page.
 */
export const TrackPage = z.object({
  items: z.array(TrackListItem),
  total: z.number().int().nonnegative(),
  libraryTotal: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type TrackPage = z.infer<typeof TrackPage>;

/**
 * One artist on the Artists tab (`GET /api/library/artists`): every artist with a track in the
 * library (not skipped by the rules) or added as a source. Sorted by name.
 */
export const ArtistListItem = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  avatarUrl: ArtworkPath.nullable(),
  /** Added as a source and subscribed (the bell badge). */
  subscribed: z.boolean(),
  sourceId: z.number().int().positive().nullable(),
  /** Albums of this artist on the Albums tab. */
  albumCount: z.number().int().nonnegative(),
  /** Tracks of this artist in the library: wanted, downloading, on disk or missing. */
  trackCount: z.number().int().nonnegative(),
});
export type ArtistListItem = z.infer<typeof ArtistListItem>;

/** `GET /api/library/albums` query. */
export const AlbumListQuery = z.object({
  /** Only albums of this `artists` row. */
  artistId: z.coerce.number().int().positive().optional(),
});
export type AlbumListQuery = z.infer<typeof AlbumListQuery>;

/**
 * One album on the Albums tab (`GET /api/library/albums`). `trackCount` counts the album's
 * tracks the rules want (wanted, downloading, on disk or missing; not skipped), `onDiskCount`
 * those on disk: fewer on disk is an incomplete album (`12/14 tracks` in red). Albums whose
 * every track is skipped are not listed. Sorted by artist, newest year first, then title.
 */
export const AlbumListItem = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().nullable(),
  coverUrl: ArtworkPath.nullable(),
  artist: z.object({ id: z.number().int().positive(), name: z.string() }),
  trackCount: z.number().int().nonnegative(),
  onDiskCount: z.number().int().nonnegative(),
  /** The first track on disk in album order (the tile opens Preview on it), or null. */
  firstTrackId: z.number().int().positive().nullable(),
});
export type AlbumListItem = z.infer<typeof AlbumListItem>;

/**
 * `GET /api/library/playlists` query. Only the Music library has a Playlists tab; the Video
 * library shows its playlists as sources on the Channels tab.
 */
export const PlaylistListQuery = z.object({
  library: z.literal('music').default('music'),
});
export type PlaylistListQuery = z.infer<typeof PlaylistListQuery>;

/**
 * One synced playlist on the Playlists tab (`GET /api/library/playlists?library=music`): the
 * playlist sources of the library, sorted by name. Counts as for albums, over the playlist's
 * positions; `durationSeconds` sums the counted items.
 */
export const PlaylistListItem = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  sourceId: z.number().int().positive().nullable(),
  trackCount: z.number().int().nonnegative(),
  onDiskCount: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  /** The first four distinct covers of the items on disk, in playlist order (the stack). */
  covers: z.array(ArtworkPath).max(4),
  /** The first item on disk in playlist order (the tile opens Preview on it), or null. */
  firstTrackId: z.number().int().positive().nullable(),
});
export type PlaylistListItem = z.infer<typeof PlaylistListItem>;

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

/** A video on Home. */
export const HomeVideoItem = VideoListItem.extend({ kind: z.literal('video') });
export type HomeVideoItem = z.infer<typeof HomeVideoItem>;

/** A track on Home (the art-only tile with the hover chin). */
export const HomeMusicItem = TrackListItem.extend({ kind: z.literal('music') });
export type HomeMusicItem = z.infer<typeof HomeMusicItem>;

export const HomeItem = z.discriminatedUnion('kind', [HomeVideoItem, HomeMusicItem]);
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

/**
 * `GET /api/library/summary`: the Video header sub (`4 channels · 1 playlist · 368 videos · 130 GB`)
 * and the Music one (`31 artists · 84 albums · 3 playlists · 4 artist subscriptions`).
 */
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
  music: z.object({
    /** Artists on the Artists tab. */
    artists: z.number().int().nonnegative(),
    /** Albums on the Albums tab. */
    albums: z.number().int().nonnegative(),
    /** Playlist sources in the Music library. */
    playlists: z.number().int().nonnegative(),
    /** Subscribed artist sources. */
    artistSubscriptions: z.number().int().nonnegative(),
  }),
});
export type LibrarySummary = z.infer<typeof LibrarySummary>;
