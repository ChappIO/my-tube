import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_VIDEO_MATCHER,
  LIVE_WORD_PATTERN,
  Source,
  and,
  not,
} from '@mytube/shared';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsService } from '../settings/settings.service.js';
import { MIGRATIONS_DIR, openDatabase } from './database.module.js';
import { listMigrationFiles, runMigrations } from './migrate.js';
import { sources } from './schema.js';

/** The first matcher-tree migration; everything before it is the flat-rules schema. */
const MATCHER_MIGRATION = '20260926090000_matcher_rules.sql';

/**
 * Upgrades a database that holds the flat rules format used before matcher trees: migrates to
 * the last file before the matcher migration, writes
 * old-shaped rows, then runs the rest (the SQL files and the code migration between them).
 */
describe('matcher rules migration', () => {
  let dir: string;
  let client: BetterSqlite3.Database;
  let db: ReturnType<typeof openDatabase>['db'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-legacy-'));
    for (const file of listMigrationFiles(MIGRATIONS_DIR)) {
      if (file < MATCHER_MIGRATION) copyFileSync(join(MIGRATIONS_DIR, file), join(dir, file));
    }
    ({ client, db } = openDatabase(':memory:'));
    runMigrations(client, dir);
  });

  afterEach(() => {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const insertSource = (id: number, library: string, kind: string, rules: unknown) =>
    client
      .prepare(
        `INSERT INTO sources (id, library, kind, youtube_id, url, name, rules)
         VALUES (?, ?, ?, ?, 'https://www.youtube.com/@x', ?, ?)`,
      )
      .run(id, library, kind, `yt${id}`, `Source ${id}`, JSON.stringify(rules));
  const setting = (key: string, value: unknown) =>
    client
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  const upgrade = () => runMigrations(client, MIGRATIONS_DIR);

  it('converts every source, the old skip reasons and the default rule settings', () => {
    insertSource(1, 'video', 'channel', {
      library: 'video',
      skipShorts: true,
      keepDays: 30,
      publishedAfter: '2025-01-01',
      titleFilter: 'Moon',
      syncOrder: false,
    });
    insertSource(2, 'video', 'playlist', {
      library: 'video',
      skipShorts: false,
      keepDays: null,
      publishedAfter: null,
      titleFilter: null,
      syncOrder: true,
    });
    insertSource(3, 'music', 'artist', {
      library: 'music',
      skipLiveRecordings: true,
      embedCoverArt: false,
    });
    insertSource(4, 'music', 'artist', { library: 'music', skipLiveRecordings: false });
    // A row the old schema would not have accepted falls back to the library defaults.
    insertSource(5, 'video', 'channel', { library: 'video', keepDays: 0 });
    client.prepare("INSERT INTO channels (id, youtube_id, name) VALUES (1, 'UCx', 'X')").run();
    client
      .prepare(
        `INSERT INTO videos (channel_id, youtube_id, title, status, skip_reason)
         VALUES (1, 'a', 'A', 'skipped', 'short'), (1, 'b', 'B', 'skipped', 'unavailable'),
                (1, 'c', 'C', 'skipped', 'older_than_keep_days')`,
      )
      .run();
    setting('video.keepDays', null);
    setting('video.skipShorts', true);
    setting('music.skipLiveRecordings', true);
    setting('general.theme', 'dark');

    // Later migrations follow these two; only the order of the 3b pair matters here.
    expect(upgrade().applied.slice(0, 2)).toEqual([
      '20260926090000_matcher_rules.sql',
      '20260926090100_drop_sources_rules.sql',
    ]);

    const rows = db.select().from(sources).orderBy(sources.id).all();
    expect(rows.map((row) => [row.matcher, row.options])).toEqual([
      [
        and(
          not({ type: 'is_short' }),
          not({ type: 'older_than_days', days: 30 }),
          { type: 'published_after', date: '2025-01-01' },
          { type: 'title_contains', text: 'Moon' },
        ),
        { embedCoverArt: true, syncOrder: false },
      ],
      [and(), { embedCoverArt: true, syncOrder: true }],
      [
        and(not({ type: 'title_matches', pattern: LIVE_WORD_PATTERN })),
        { embedCoverArt: false, syncOrder: false },
      ],
      [DEFAULT_MUSIC_MATCHER, { embedCoverArt: true, syncOrder: false }],
      // The old defaults (the members-only condition came later).
      [
        and(not({ type: 'is_short' }), not({ type: 'older_than_days', days: 90 })),
        { embedCoverArt: true, syncOrder: false },
      ],
    ]);
    // Every converted row is a valid source; the rules column is gone.
    for (const row of rows) expect(Source.safeParse(row).success).toBe(true);
    const columns = client.prepare("SELECT name FROM pragma_table_info('sources')").pluck().all();
    expect(columns).not.toContain('rules');
    expect(columns).toEqual(expect.arrayContaining(['matcher', 'options', 'last_revalidated_at']));

    expect(
      client.prepare('SELECT youtube_id, skip_reason FROM videos ORDER BY youtube_id').all(),
    ).toEqual([
      { youtube_id: 'a', skip_reason: 'no_match' },
      { youtube_id: 'b', skip_reason: 'unavailable' },
      { youtube_id: 'c', skip_reason: 'no_match' },
    ]);

    const settings = new SettingsService(db).get();
    expect(settings.video.defaultRules).toEqual(and(not({ type: 'is_short' })));
    expect(settings.music.defaultRules).toEqual(
      and(not({ type: 'title_matches', pattern: LIVE_WORD_PATTERN })),
    );
    expect(settings.general.theme).toBe('dark');
    expect(client.prepare('SELECT key FROM settings ORDER BY key').pluck().all()).toEqual([
      'general.theme',
      'music.defaultRules',
      'video.defaultRules',
    ]);
  });

  it('writes no settings when the old defaults were never changed', () => {
    upgrade();
    expect(client.prepare('SELECT count(*) FROM settings').pluck().get()).toBe(0);
    expect(new SettingsService(db).get().video.defaultRules).toEqual(DEFAULT_VIDEO_MATCHER);
  });

  it('keeps jobs and their history links through the jobs rebuild', () => {
    client
      .prepare(
        `INSERT INTO jobs (id, type, status, payload) VALUES
           (1, 'download', 'done', '{"title":"A"}'), (2, 'retention', 'queued', '{"title":"R"}')`,
      )
      .run();
    client
      .prepare("INSERT INTO history (kind, title, result, job_id) VALUES ('video', 'A', 'done', 1)")
      .run();
    upgrade();
    expect(client.prepare('SELECT id, type FROM jobs ORDER BY id').all()).toEqual([
      { id: 1, type: 'download' },
      { id: 2, type: 'revalidate' },
    ]);
    expect(client.prepare('SELECT job_id FROM history').pluck().all()).toEqual([1]);
    expect(client.pragma('foreign_key_check')).toEqual([]);
    expect(() =>
      client.prepare("INSERT INTO jobs (type, payload) VALUES ('retention', '{}')").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      client
        .prepare("INSERT INTO history (kind, title, result, job_id) VALUES ('video', 'x', 'y', 99)")
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});
