import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase } from '../database/database.module.js';
import { runMigrations } from '../database/migrate.js';
import { HistoryService } from './history.service.js';

function create(): HistoryService {
  const { db, client } = openDatabase(':memory:');
  runMigrations(client, MIGRATIONS_DIR);
  return new HistoryService(db);
}

describe('HistoryService', () => {
  it('records entries with a timestamp and returns the newest first', () => {
    const history = create();
    const first = history.record({
      kind: 'system',
      title: 'yt-dlp 2026.09.22 installed',
      result: 'installed',
    });
    history.record({ kind: 'video', title: 'Hand-cut dovetails', result: 'done', details: 'x' });

    expect(first).toMatchObject({ id: 1, kind: 'system', details: null });
    expect(first.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(history.recent().map((entry) => entry.title)).toEqual([
      'Hand-cut dovetails',
      'yt-dlp 2026.09.22 installed',
    ]);
    expect(history.recent(1)).toHaveLength(1);
  });

  it('rejects an unknown kind at the database level', () => {
    const history = create();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately invalid
    const kind = 'other' as 'system';
    expect(() => history.record({ kind, title: 't', result: 'r' })).toThrow(/CHECK constraint/);
  });
});
