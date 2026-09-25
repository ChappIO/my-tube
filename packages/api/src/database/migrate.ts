import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { CODE_MIGRATIONS } from './code-migrations.js';

/**
 * Applies hand-written SQL migrations in file-name order.
 *
 * Files live in ./migrations and are named `<YYYYMMDDHHMMSS>_<snake_case_name>.sql`.
 * Each file runs inside one transaction and is recorded in the `migrations` table,
 * so a file is applied exactly once. There is no journal or snapshot chain: two
 * branches only conflict when they change the same table.
 *
 * A data conversion that SQL cannot express well runs as a code migration: a function keyed by
 * the SQL file it follows (`hooks`), run in the same transaction right after that file. The
 * app's hooks are `CODE_MIGRATIONS` (see `code-migrations.ts`).
 */
const MIGRATION_FILE = /^\d{14}_[a-z0-9_]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  skipped: number;
}

export function listMigrationFiles(dir: string): string[] {
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql'));
  for (const file of files) {
    if (!MIGRATION_FILE.test(file)) {
      throw new Error(`Migration "${file}" must be named <YYYYMMDDHHMMSS>_<snake_case_name>.sql`);
    }
  }
  return files.toSorted();
}

/** Code run right after the SQL file it is keyed by, in the same transaction. */
export type MigrationHooks = Readonly<Record<string, (db: Database) => void>>;

export function runMigrations(
  db: Database,
  dir: string,
  hooks: MigrationHooks = CODE_MIGRATIONS,
): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const alreadyApplied = new Set(
    db
      .prepare<[], { name: string }>('SELECT name FROM migrations')
      .all()
      .map((row) => row.name),
  );
  const record = db.prepare('INSERT INTO migrations (name) VALUES (?)');
  const applied: string[] = [];

  for (const file of listMigrationFiles(dir)) {
    if (alreadyApplied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      hooks[file]?.(db);
      record.run(file);
    })();
    applied.push(file);
  }

  return { applied, skipped: alreadyApplied.size };
}
