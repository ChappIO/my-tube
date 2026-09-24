import type { Rules } from '@mytube/shared';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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
    /** The shared `Rules` schema; parse with `Rules` when reading untrusted rows. */
    rules: text('rules', { mode: 'json' }).$type<Rules>().notNull(),
    lastCheckedAt: text('last_checked_at'),
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

/** Kinds of history entries, matching the Activity screen's kind chip. */
export const HISTORY_KINDS = ['video', 'music', 'system'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** Audit trail: downloads, retention deletions, yt-dlp installs and updates. */
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
