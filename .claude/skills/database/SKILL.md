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

| Table        | Columns                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrations` | `name` (file name, PK), `applied_at`. Owned by the migration runner.                                                                             |
| `settings`   | `key` (dotted path such as `general.theme`, PK), `value` (JSON text), `updated_at`. One row per changed field; see the backend skill "Settings". |

## Querying

Inject the database with `@Inject(DATABASE) private readonly db: Database` and use Drizzle: `this.db.select().from(settings).where(eq(settings.key, 'theme'))`. better-sqlite3 is synchronous; Drizzle's sqlite driver exposes `.all()`, `.get()`, `.run()` synchronously and the query builder is also awaitable.

## Tests

`migrate.spec.ts` covers the runner with in-memory databases. The API e2e test verifies a fresh `CONFIG_DIR` gets a migrated database. Add a spec when a migration does data transformation.
