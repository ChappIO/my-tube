import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Global, Logger, Module } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { AppConfig } from '../config/app-config.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';

export const DATABASE = Symbol('DATABASE');
export type Database = BetterSQLite3Database<typeof schema>;

/** Folder of the SQL migrations, next to this file in src and in dist. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export function openDatabase(file: string): { db: Database; client: BetterSqlite3.Database } {
  const client = new BetterSqlite3(file);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  registerFunctions(client);
  return { db: drizzle({ client, schema }), client };
}

/**
 * The better-sqlite3 connection under a Drizzle database, for what Drizzle does not wrap (the
 * online `backup()`).
 */
export function sqliteClient(db: Database): BetterSqlite3.Database {
  const client: unknown = Reflect.get(db, '$client');
  if (!(client instanceof BetterSqlite3)) {
    throw new Error('The database has no better-sqlite3 connection');
  }
  return client;
}

/**
 * Text folded for searching and sorting: decomposed, accents dropped, lower case. SQLite's own
 * `lower()` and `LIKE` only fold ASCII, so `beyonce` would not find `Beyoncé`.
 */
export function foldText(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** SQL functions of the app, on every connection: `mytube_fold(text)` is `foldText`. */
function registerFunctions(client: BetterSqlite3.Database): void {
  client.function('mytube_fold', { deterministic: true }, (value: unknown) =>
    typeof value === 'string' ? foldText(value) : value,
  );
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Database => {
        const logger = new Logger('Database');
        mkdirSync(config.configDir, { recursive: true });
        const file = join(config.configDir, 'mytube.db');
        const { db, client } = openDatabase(file);
        const result = runMigrations(client, MIGRATIONS_DIR);
        logger.log(
          `Opened ${file} (${result.applied.length} migrations applied, ${result.skipped} already up to date)`,
        );
        return db;
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
