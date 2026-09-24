---
name: database
description: SQLite, Drizzle schema and the hand-written SQL migration system for MyTube. Read before changing tables, writing a migration, or querying the database.
---

# Database

One SQLite file, `<CONFIG_DIR>/mytube.db`, opened with better-sqlite3 in WAL mode with foreign keys on. Drizzle ORM provides typed queries. Code lives in `packages/api/src/database`.

## Migrations

Migrations are plain SQL files in `packages/api/src/database/migrations`, applied automatically when the API starts (`DatabaseModule` calls `runMigrations`). There is no drizzle-kit journal and no snapshot chain.

- File name: `<YYYYMMDDHHMMSS>_<snake_case_name>.sql`, timestamp in UTC. The runner rejects other names.
- Files apply in name order, each inside one transaction, and are recorded in the `migrations` table so they run exactly once. A failing file rolls back and stops the boot.
- Never edit or delete a migration that has been merged to `main`. Write a new one.
- Keep each file focused on one change. Two branches only conflict when they change the same table, and the fix is to rename one file with a later timestamp.
- SQLite has limited `ALTER TABLE`. To change a column, create the new table, copy, drop, rename.
- Timestamps are stored as ISO 8601 text in UTC: `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.

## Schema

`schema.ts` is the Drizzle description of the same tables, used for typing and query building. It does not create anything. When you add a migration, update `schema.ts` to match in the same commit.

## Tables

| Table         | Columns                                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations`  | `name` (file name, PK), `applied_at`. Owned by the migration runner.                                                                                                                                                                                           |
| `settings`    | `key` (dotted path such as `general.theme`, PK), `value` (JSON text), `updated_at`. One row per changed field; see the backend skill "Settings".                                                                                                               |
| `history`     | `id` (PK), `at` (ISO UTC, default now, indexed as `history_at`), `kind` (`video`, `music`, `system`; CHECK), `title`, `result` (`done`, `installed`, `updated`, `failed`, ...), `details` (nullable free text). Append-only; written through `HistoryService`. |
| `ytdlp_state` | Single row, `id` = 1 (CHECK): `installed_version`, `latest_version`, `last_checked_at`, `last_updated_at`, `last_error`, all nullable. Owned by the yt-dlp binary manager; not user settings.                                                                  |

### Sources and catalog

Migration `20260924193510_sources.sql`. Every table has `id` (INTEGER PK), `created_at` and `updated_at`.

| Table       | Columns                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`   | What the user added. `library` (`music`/`video`), `kind` (`channel`/`artist`/`playlist`), `youtube_id`, `url`, `name`, `avatar_url` (null), `subscribed` (0/1, default 1), `rules` (JSON of the shared `Rules` schema; `json_valid` and its `library` tag must equal the row's), `last_checked_at` (null), `item_count`, `size_bytes`. `UNIQUE (library, youtube_id)`. |
| `channels`  | Every channel MyTube knows, `youtube_id` UNIQUE, `name`, `avatar_url`, `source_id` (null).                                                                                                                                                                                                                                                                             |
| `artists`   | Every artist MyTube knows, `youtube_id` UNIQUE but nullable (YouTube Music artist or channel id; null for artists known only from tags), `name` (indexed), `avatar_url`, `source_id` (null).                                                                                                                                                                           |
| `playlists` | Playlists synced from YouTube, `library`, `youtube_id` UNIQUE, `name`, `thumbnail_url`, `item_count`, `source_id` (null).                                                                                                                                                                                                                                              |

- **A channel row exists for every channel we know**, not only for subscribed ones: a video that arrives through a playlist still gets its channel row. `source_id` points at the source only when the channel (or artist, or playlist) was added as one. The same holds for `artists` and `playlists`.
- `source_id` is `ON DELETE SET NULL` and indexed. Deleting a source unlinks its catalog rows and never removes them, and never touches files. Unsubscribing only flips `subscribed`.
- The same YouTube id can be a source in both libraries (two `sources` rows), but it has one `channels`, `artists` or `playlists` row.
- In Drizzle, `subscribed` is `integer({ mode: 'boolean' })` and `rules` is `text({ mode: 'json' }).$type<Rules>()`. The `Source` DTO in shared maps one to one onto a `sources` row (`Source.parse(row)`).
- Items (`videos`, `tracks`, `albums`, `playlist_items`) are in "Items and jobs" below.

### Items and jobs

Migration `20260925090000_items.sql`. Item tables have `id` (INTEGER PK), `created_at` and `updated_at`.

| Table            | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `videos`         | `channel_id` (NOT NULL → `channels`), `source_id` (null, `ON DELETE SET NULL`), `youtube_id` UNIQUE, `title`, `duration_seconds`, `published_at` (`YYYY-MM-DD` or ISO), `thumbnail_url`, `is_short` (0/1), `live_status` (yt-dlp's), `status`, `skip_reason`, `file_path` (relative to the video mount), `file_size_bytes`, `downloaded_at`. Indexed on `channel_id`, `source_id`, `status`, `published_at`.                                                                                                                                                         |
| `albums`         | `artist_id` (NOT NULL → `artists`), `youtube_id` UNIQUE nullable (YouTube Music album id; null for albums known only from tags), `title`, `year`, `cover_url`, `track_count`.                                                                                                                                                                                                                                                                                                                                                                                        |
| `tracks`         | `album_id` (null until album grouping), `artist_id` (NOT NULL), `source_id` (null, `ON DELETE SET NULL`), `youtube_id` UNIQUE, `title`, `track_number`, `disc_number`, `duration_seconds`, `published_at`, `thumbnail_url`, and the same `status`, `skip_reason`, `file_path`, `file_size_bytes`, `downloaded_at` as videos. Indexed on the foreign keys, `status`, `published_at`.                                                                                                                                                                                  |
| `playlist_items` | `playlist_id` (→ `playlists`, `ON DELETE CASCADE`), `position`, `video_id` or `track_id` (exactly one, CHECK). `UNIQUE (playlist_id, position)`. No timestamps.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `jobs`           | `type` (CHECK: `download`, `check_source`, `retention`, `rescan`, `backup`), `status` (CHECK: `queued`, `running`, `done`, `failed`, `cancelled`), `payload` (JSON, `json_valid`), `dedupe_key`, `priority` (higher first), `attempts` (failed attempts), `max_attempts` (3), `run_after`, `progress` (0 to 1), `speed_bytes_per_sec`, `eta_seconds`, `error`, `created_at`, `started_at`, `finished_at`, `updated_at`. Index `jobs_pick (status, priority, run_after, id)`; partial unique index `jobs_active_key (type, dedupe_key)` over queued and running rows. |

**Item status lifecycle** (`ItemStatus` in `packages/shared/src/items.ts`; the column has a CHECK):

- A fetched entry the source's rules accept is inserted as `wanted` and a `download` job is enqueued for it.
- A fetched entry the rules reject is inserted as `skipped` with `skip_reason` (a `SkipReason`: `short`, `title_filter`, `published_before`, `older_than_keep_days`, `live`, `upcoming`). Transient rejections (a premiere or stream that has not finished) are not stored; the next check sees them again. Changing a source's rules may move `skipped` items back to `wanted`.
- `wanted` → `downloading` when the download job starts, → `on_disk` when the file is written (`file_path`, `file_size_bytes`, `downloaded_at` set). A failed download goes back to `wanted` (the job retries; after its last attempt the item stays `wanted` and the failure is in history).
- `on_disk` → `missing` when a rescan finds no file, or when retention deletes it. `file_path` is kept so the library can show where it was.
- `missing` → `wanted` only through an explicit re-download. Nothing moves an item out of `skipped` or `missing` on its own.
- Rows are never deleted by sync, unsubscribing or removing a source (`source_id` becomes null).

In Drizzle, `status` and `skip_reason` are `text().$type<ItemStatus>()` / `$type<SkipReason>()`, `is_short` is `integer({ mode: 'boolean' })`, and `jobs.payload` is `text({ mode: 'json' }).$type<JobPayload>()` (`title`, optional `subtitle` and `historyKind`, plus runner fields). A `videos` row parses as the shared `Video` DTO and a `tracks` row as `Track`. Write jobs only through `JobsService` (see the backend skill "Jobs"); finished job rows are kept, history is the durable record.

## Querying

Inject the database with `@Inject(DATABASE) private readonly db: Database` and use Drizzle: `this.db.select().from(settings).where(eq(settings.key, 'theme'))`. better-sqlite3 is synchronous; Drizzle's sqlite driver exposes `.all()`, `.get()`, `.run()` synchronously and the query builder is also awaitable.

## Tests

`migrate.spec.ts` covers the runner with in-memory databases. The API e2e test verifies a fresh `CONFIG_DIR` gets a migrated database. Add a spec when a migration does data transformation.
