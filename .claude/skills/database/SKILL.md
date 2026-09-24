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
- Items (`videos`, `tracks`, `albums`, `playlist_items`) arrive in Stage 4.

## Querying

Inject the database with `@Inject(DATABASE) private readonly db: Database` and use Drizzle: `this.db.select().from(settings).where(eq(settings.key, 'theme'))`. better-sqlite3 is synchronous; Drizzle's sqlite driver exposes `.all()`, `.get()`, `.run()` synchronously and the query builder is also awaitable.

## Tests

`migrate.spec.ts` covers the runner with in-memory databases. The API e2e test verifies a fresh `CONFIG_DIR` gets a migrated database. Add a spec when a migration does data transformation.
