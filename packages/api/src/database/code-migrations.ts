import type { Database } from 'better-sqlite3';
import { convertLegacyData } from './legacy-rules.js';

/**
 * Code migrations, keyed by the SQL migration they follow. `runMigrations` runs each right after
 * its file, in the same transaction, so later SQL files can rely on the converted data. Like
 * SQL files, never change one that has been merged; add a new one.
 */
export const CODE_MIGRATIONS: Readonly<Record<string, (db: Database) => void>> = {
  // Flat rules → matcher trees and options, before 20260926090100 drops `sources.rules`.
  '20260926090000_matcher_rules.sql': convertLegacyData,
};
