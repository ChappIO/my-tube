import { Logger } from '@nestjs/common';
import {
  DEFAULT_SETTINGS,
  LegacyMusicRules,
  LegacyRules,
  LegacyVideoRules,
  convertLegacyRules,
  settingsKey,
} from '@mytube/shared';
import type { Database } from 'better-sqlite3';

/** The old default-rule settings that `video.defaultRules` / `music.defaultRules` replace. */
const LEGACY_SETTINGS = {
  video: ['video.keepDays', 'video.skipShorts'],
  music: ['music.skipLiveRecordings'],
} as const;

/**
 * Code migration after `20260926090000_matcher_rules.sql` (the switch to matcher trees):
 *
 * 1. Every source whose `matcher` is still `'null'` gets the tree and options equivalent to its
 *    flat `rules` (`convertLegacyRules` in shared). Rules that no longer parse fall back to the
 *    library defaults, the same thing the old code did with an invalid row.
 * 2. The old per-library defaults in the settings table (`video.keepDays`, `video.skipShorts`,
 *    `music.skipLiveRecordings`) become `video.defaultRules` / `music.defaultRules` (unless one
 *    exists already), and the old rows are deleted. Without old rows nothing is written: the new
 *    defaults equal the old ones.
 *
 * Runs inside the migration's transaction, so a failure rolls the whole step back.
 */
export function convertLegacyData(db: Database): void {
  const logger = new Logger('Migrations');
  const rows = db
    .prepare<[], { id: number; library: string; rules: string }>(
      "SELECT id, library, rules FROM sources WHERE matcher = 'null'",
    )
    .all();
  const update = db.prepare('UPDATE sources SET matcher = ?, options = ? WHERE id = ?');
  for (const row of rows) {
    const { matcher, options } = convertLegacyRules(legacyRules(row.library, row.rules));
    update.run(JSON.stringify(matcher), JSON.stringify(options), row.id);
  }
  if (rows.length > 0) logger.log(`Converted the rules of ${rows.length} source(s) to matchers`);

  const stored = new Map(
    db
      .prepare<[], { key: string; value: string }>('SELECT key, value FROM settings')
      .all()
      .map((row) => [row.key, row.value]),
  );
  /** The stored value, or `fallback` without a row (null is a value: keep forever). */
  const read = (key: string, fallback: unknown): unknown => {
    const raw = stored.get(key);
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const write = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO NOTHING`,
  );
  const remove = db.prepare('DELETE FROM settings WHERE key = ?');

  for (const library of ['video', 'music'] as const) {
    const keys = LEGACY_SETTINGS[library];
    if (!keys.some((key) => stored.has(key))) continue;
    const legacy =
      library === 'video'
        ? LegacyVideoRules.safeParse({
            library,
            keepDays: read('video.keepDays', DEFAULT_LEGACY_VIDEO.keepDays),
            skipShorts: read('video.skipShorts', DEFAULT_LEGACY_VIDEO.skipShorts),
          })
        : LegacyMusicRules.safeParse({
            library,
            skipLiveRecordings: read('music.skipLiveRecordings', false),
          });
    const matcher = legacy.success
      ? convertLegacyRules(legacy.data).matcher
      : DEFAULT_SETTINGS[library].defaultRules;
    write.run(settingsKey(library, 'defaultRules'), JSON.stringify(matcher));
    for (const key of keys) remove.run(key);
    logger.log(`Converted the ${library} default rules to a matcher`);
  }
}

const DEFAULT_LEGACY_VIDEO = LegacyVideoRules.parse({ library: 'video' });

function legacyRules(library: string, raw: string): LegacyRules {
  const fallback: LegacyRules = { library: library === 'music' ? 'music' : 'video' };
  try {
    const parsed = LegacyRules.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.library === fallback.library ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
