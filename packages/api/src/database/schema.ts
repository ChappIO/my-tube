import {
  HISTORY_KINDS,
  type HistoryKind,
  type ItemStatus,
  type JobStatus,
  type JobType,
  type Matcher,
  type SkipReason,
  type SourceOptions,
} from '@mytube/shared';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema. This is the typed view of the tables; the tables themselves are
 * created by the SQL files in ./migrations. Keep both in sync.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// Sources and the channel, artist and playlist catalog (migration 20260924193510_sources).

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const timestamps = {
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
};

export const sources = sqliteTable(
  'sources',
  {
    id: integer('id').primaryKey(),
    library: text('library', { enum: ['music', 'video'] }).notNull(),
    kind: text('kind', { enum: ['channel', 'artist', 'playlist'] }).notNull(),
    youtubeId: text('youtube_id').notNull(),
    url: text('url').notNull(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    subscribed: integer('subscribed', { mode: 'boolean' }).notNull().default(true),
    /** The rules: the shared `Matcher` tree (migration 20260926090000_matcher_rules). */
    matcher: text('matcher', { mode: 'json' }).$type<Matcher>().notNull(),
    /** The shared `SourceOptions` (cover art, sync order). */
    options: text('options', { mode: 'json' }).$type<SourceOptions>().notNull(),
    lastCheckedAt: text('last_checked_at'),
    /** Last revalidation of the files against the rules; null before the first. */
    lastRevalidatedAt: text('last_revalidated_at'),
    itemCount: integer('item_count').notNull().default(0),
    sizeBytes: integer('size_bytes').notNull().default(0),
    ...timestamps,
  },
  (table) => [unique().on(table.library, table.youtubeId)],
);

/** Every known channel; `sourceId` is set when the channel was added as a source. */
export const channels = sqliteTable(
  'channels',
  {
    id: integer('id').primaryKey(),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    youtubeId: text('youtube_id').notNull().unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    ...timestamps,
  },
  (table) => [index('channels_source_id').on(table.sourceId)],
);

export const artists = sqliteTable(
  'artists',
  {
    id: integer('id').primaryKey(),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    youtubeId: text('youtube_id').unique(),
    name: text('name').notNull(),
    avatarUrl: text('avatar_url'),
    ...timestamps,
  },
  (table) => [index('artists_source_id').on(table.sourceId), index('artists_name').on(table.name)],
);

export const playlists = sqliteTable(
  'playlists',
  {
    id: integer('id').primaryKey(),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    library: text('library', { enum: ['music', 'video'] }).notNull(),
    youtubeId: text('youtube_id').notNull().unique(),
    name: text('name').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    itemCount: integer('item_count').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('playlists_source_id').on(table.sourceId)],
);

/** Kinds of history entries, matching the Activity screen's kind chip (shared `HistoryKind`). */
export { HISTORY_KINDS, type HistoryKind };

/** Audit trail: downloads, files removed by revalidation, yt-dlp installs and updates. */
export const history = sqliteTable(
  'history',
  {
    id: integer('id').primaryKey(),
    at: text('at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    kind: text('kind', { enum: HISTORY_KINDS }).notNull(),
    title: text('title').notNull(),
    result: text('result').notNull(),
    details: text('details'),
    /** The job that wrote the row (migration 20260925120000_history_job_id); its log is kept. */
    jobId: integer('job_id').references(() => jobs.id),
  },
  (table) => [index('history_at').on(table.at)],
);

/** yt-dlp binary manager state: at most one row, id 1. */
export const ytdlpState = sqliteTable('ytdlp_state', {
  id: integer('id').primaryKey(),
  installedVersion: text('installed_version'),
  latestVersion: text('latest_version'),
  lastCheckedAt: text('last_checked_at'),
  lastUpdatedAt: text('last_updated_at'),
  lastError: text('last_error'),
});

// Items and the jobs queue (migration 20260925090000_items; jobs rebuilt by
// 20260926090000_matcher_rules for the `revalidate` type). Status lifecycle: database skill.

/** A known video. `status` is the shared `ItemStatus`; `skipReason` a `SkipReason`. */
export const videos = sqliteTable(
  'videos',
  {
    id: integer('id').primaryKey(),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    youtubeId: text('youtube_id').notNull().unique(),
    title: text('title').notNull(),
    durationSeconds: integer('duration_seconds'),
    publishedAt: text('published_at'),
    thumbnailUrl: text('thumbnail_url'),
    isShort: integer('is_short', { mode: 'boolean' }).notNull().default(false),
    liveStatus: text('live_status'),
    status: text('status').$type<ItemStatus>().notNull().default('wanted'),
    skipReason: text('skip_reason').$type<SkipReason>(),
    filePath: text('file_path'),
    fileSizeBytes: integer('file_size_bytes'),
    downloadedAt: text('downloaded_at'),
    ...timestamps,
  },
  (table) => [
    index('videos_channel_id').on(table.channelId),
    index('videos_source_id').on(table.sourceId),
    index('videos_status').on(table.status),
    index('videos_published_at').on(table.publishedAt),
  ],
);

export const albums = sqliteTable(
  'albums',
  {
    id: integer('id').primaryKey(),
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id),
    youtubeId: text('youtube_id').unique(),
    title: text('title').notNull(),
    year: integer('year'),
    coverUrl: text('cover_url'),
    trackCount: integer('track_count'),
    ...timestamps,
  },
  (table) => [index('albums_artist_id').on(table.artistId)],
);

/** A known track. `albumId` is null until album grouping assigns one. */
export const tracks = sqliteTable(
  'tracks',
  {
    id: integer('id').primaryKey(),
    albumId: integer('album_id').references(() => albums.id),
    artistId: integer('artist_id')
      .notNull()
      .references(() => artists.id),
    sourceId: integer('source_id').references(() => sources.id, { onDelete: 'set null' }),
    youtubeId: text('youtube_id').notNull().unique(),
    title: text('title').notNull(),
    trackNumber: integer('track_number'),
    discNumber: integer('disc_number'),
    durationSeconds: integer('duration_seconds'),
    publishedAt: text('published_at'),
    thumbnailUrl: text('thumbnail_url'),
    status: text('status').$type<ItemStatus>().notNull().default('wanted'),
    skipReason: text('skip_reason').$type<SkipReason>(),
    filePath: text('file_path'),
    fileSizeBytes: integer('file_size_bytes'),
    downloadedAt: text('downloaded_at'),
    ...timestamps,
  },
  (table) => [
    index('tracks_album_id').on(table.albumId),
    index('tracks_artist_id').on(table.artistId),
    index('tracks_source_id').on(table.sourceId),
    index('tracks_status').on(table.status),
    index('tracks_published_at').on(table.publishedAt),
  ],
);

/** Ordered playlist entries; exactly one of `videoId` and `trackId` is set (CHECK). */
export const playlistItems = sqliteTable(
  'playlist_items',
  {
    id: integer('id').primaryKey(),
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    videoId: integer('video_id').references(() => videos.id),
    trackId: integer('track_id').references(() => tracks.id),
  },
  (table) => [
    unique().on(table.playlistId, table.position),
    index('playlist_items_video_id').on(table.videoId),
    index('playlist_items_track_id').on(table.trackId),
  ],
);

/** The work queue. Written through `JobsService` only. */
export const jobs = sqliteTable(
  'jobs',
  {
    id: integer('id').primaryKey(),
    type: text('type').$type<JobType>().notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    /** JSON: always `title` (and optionally `subtitle`) plus runner-specific fields. */
    payload: text('payload', { mode: 'json' }).$type<JobPayload>().notNull(),
    /** Identifies the work for de-duplication among queued and running jobs. */
    dedupeKey: text('dedupe_key'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: text('run_after'),
    progress: real('progress'),
    speedBytesPerSec: integer('speed_bytes_per_sec'),
    etaSeconds: integer('eta_seconds'),
    /** Expected download size (migration 20260925120100_jobs_total_bytes). */
    totalBytes: integer('total_bytes'),
    /** yt-dlp post-processor while post-processing (migration 20260927100000_jobs_stage). */
    stage: text('stage'),
    error: text('error'),
    createdAt: text('created_at').notNull().default(now),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (table) => [
    index('jobs_pick').on(table.status, table.priority, table.runAfter, table.id),
    uniqueIndex('jobs_active_key')
      .on(table.type, table.dedupeKey)
      .where(sql`dedupe_key IS NOT NULL AND status IN ('queued', 'running')`),
  ],
);

/** The JSON in `jobs.payload`: display fields plus whatever the job's runner needs. */
export interface JobPayload {
  /** Shown as the queue row title. */
  title: string;
  /** Shown under the title (channel or artist), when set. */
  subtitle?: string | null;
  /** History kind of a final failure (`system` when absent). Success uses the runner's. */
  historyKind?: HistoryKind;
  [field: string]: unknown;
}

/**
 * The artwork cache's bookkeeping (migration 20260927090000_artwork_cache). One row per cached
 * file under `CONFIG_DIR/cache/artwork`; owned by `ArtworkService`.
 */
export const artworkCache = sqliteTable(
  'artwork_cache',
  {
    /** `<kind>/<row id>`. */
    key: text('key').primaryKey(),
    sourceUrl: text('source_url').notNull(),
    /** Relative to `cache/artwork`. */
    file: text('file').notNull(),
    contentType: text('content_type').notNull(),
    etag: text('etag'),
    size: integer('size').notNull(),
    fetchedAt: text('fetched_at').notNull().default(now),
    usedAt: text('used_at').notNull().default(now),
  },
  (table) => [index('artwork_cache_used_at').on(table.usedAt)],
);
