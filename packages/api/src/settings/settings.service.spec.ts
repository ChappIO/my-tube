import { DEFAULT_SETTINGS } from '@mytube/shared';
import type BetterSqlite3 from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase } from '../database/database.module.js';
import { runMigrations } from '../database/migrate.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  let client: BetterSqlite3.Database;
  let service: SettingsService;

  const rows = () =>
    client
      .prepare<[], { key: string; value: string; updated_at: string }>(
        'SELECT key, value, updated_at FROM settings ORDER BY key',
      )
      .all();
  const insert = (key: string, value: string) =>
    client.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);

  beforeEach(() => {
    const opened = openDatabase(':memory:');
    client = opened.client;
    runMigrations(client, MIGRATIONS_DIR);
    service = new SettingsService(opened.db);
  });

  afterEach(() => {
    client.close();
  });

  it('returns the defaults on an empty table', () => {
    expect(service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored rows over the defaults', () => {
    insert('general.theme', '"dark"');
    insert('video.keepDays', 'null');
    const settings = service.get();
    expect(settings.general).toEqual({ ...DEFAULT_SETTINGS.general, theme: 'dark' });
    expect(settings.video.keepDays).toBeNull();
    expect(settings.music).toEqual(DEFAULT_SETTINGS.music);
  });

  it('writes only the given keys and returns the merged result', () => {
    const result = service.patch({
      general: { checkIntervalHours: 6, downloadsAtOnce: 4 },
      network: { proxy: 'socks5://nas:1080' },
    });
    expect(result.general).toEqual({ theme: 'system', checkIntervalHours: 6, downloadsAtOnce: 4 });
    expect(result.network.proxy).toBe('socks5://nas:1080');
    expect(rows().map((row) => [row.key, row.value])).toEqual([
      ['general.checkIntervalHours', '6'],
      ['general.downloadsAtOnce', '4'],
      ['network.proxy', '"socks5://nas:1080"'],
    ]);
  });

  it('overwrites an existing key and bumps updated_at', () => {
    insert('general.theme', '"light"');
    client.prepare("UPDATE settings SET updated_at = '2000-01-01T00:00:00.000Z'").run();
    service.patch({ general: { theme: 'dark' } });
    const [row] = rows();
    expect(row?.value).toBe('"dark"');
    expect(row?.updated_at).not.toBe('2000-01-01T00:00:00.000Z');
    expect(service.get().general.theme).toBe('dark');
  });

  it('stores null for nullable fields', () => {
    service.patch({ network: { rateLimit: '5M' } });
    expect(service.patch({ network: { rateLimit: null } }).network.rateLimit).toBeNull();
    expect(rows().find((row) => row.key === 'network.rateLimit')?.value).toBe('null');
  });

  it('rejects an invalid patch without writing anything', () => {
    // Type-correct but out of range: the service validates, not only the controller.
    expect(() => service.patch({ general: { theme: 'dark', downloadsAtOnce: 9 } })).toThrow();
    expect(rows()).toEqual([]);
  });

  it('ignores unknown, stale and corrupt rows', () => {
    insert('general.removedSetting', 'true');
    insert('removed.group', '1');
    insert('nodot', '1');
    insert('general.toString', '1');
    insert('general.checkIntervalHours', '3');
    insert('general.downloadsAtOnce', 'not json');
    insert('general.theme', '"dark"');
    const settings = service.get();
    expect(settings.general).toEqual({ ...DEFAULT_SETTINGS.general, theme: 'dark' });
    expect(settings).not.toHaveProperty('removed');
  });
});
