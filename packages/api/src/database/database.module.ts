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

const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));

export function openDatabase(file: string): { db: Database; client: BetterSqlite3.Database } {
  const client = new BetterSqlite3(file);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  return { db: drizzle({ client, schema }), client };
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
        const result = runMigrations(client, migrationsDir);
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
