import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { BACKUP_KEEP } from '@mytube/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import { BackupService, backupFileName } from './backup.service.js';
import { backupTitle } from './maintenance.runners.js';

describe('backupFileName', () => {
  it('names the file by its UTC time in whole seconds', () => {
    expect(backupFileName(new Date('2026-09-26T04:00:00.123Z'))).toBe(
      'mytube-2026-09-26T04:00:00Z.sqlite',
    );
  });
});

describe('BackupService', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-backup-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    const harness = createJobsHarness();
    const config = new AppConfig({ CONFIG_DIR: join(root, 'config') });
    return { ...harness, service: new BackupService(harness.db, config) };
  }

  it('writes a consistent copy of the database with the settings in it', async () => {
    const t = setup();
    t.settings.patch({ general: { downloadsAtOnce: 4 } });
    const fractions: number[] = [];
    const lines: string[] = [];

    const result = await t.service.backup(
      { progress: (fraction) => fractions.push(fraction), log: (line) => lines.push(line) },
      new Date('2026-09-26T04:00:00Z'),
    );

    expect(result).toMatchObject({
      file: 'mytube-2026-09-26T04:00:00Z.sqlite',
      at: '2026-09-26T04:00:00Z',
      path: join(root, 'config/backups/mytube-2026-09-26T04:00:00Z.sqlite'),
      removed: [],
    });
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(fractions.at(-1)).toBe(1);
    expect(lines[0]).toContain('wrote');
    // Only the backup is left in the folder: no temp file.
    expect(readdirSync(t.service.dir())).toEqual(['mytube-2026-09-26T04:00:00Z.sqlite']);

    const copy = new BetterSqlite3(result.path, { readonly: true });
    try {
      const value: unknown = copy
        .prepare("select value from settings where key = 'general.downloadsAtOnce'")
        .pluck()
        .get();
      expect(value).toBe('4');
    } finally {
      copy.close();
    }
    expect(backupTitle(result)).toMatch(/^backup · mytube-2026-09-26T04:00:00Z\.sqlite · \d+ KB$/);
  });

  it(`keeps the newest ${BACKUP_KEEP} backups and leaves other files alone`, async () => {
    const t = setup();
    mkdirSync(t.service.dir(), { recursive: true });
    for (let day = 10; day < 18; day++) {
      writeFileSync(join(t.service.dir(), `mytube-2026-09-${day}T04:00:00Z.sqlite`), 'old');
    }
    writeFileSync(join(t.service.dir(), 'my-own-copy.sqlite'), 'mine');

    const result = await t.service.backup({}, new Date('2026-09-26T04:00:00Z'));

    // Eight old ones and the new one: the two oldest go.
    expect(result.removed).toEqual([
      'mytube-2026-09-11T04:00:00Z.sqlite',
      'mytube-2026-09-10T04:00:00Z.sqlite',
    ]);
    expect(t.service.files()).toHaveLength(BACKUP_KEEP);
    expect(t.service.files()[0]).toBe('mytube-2026-09-26T04:00:00Z.sqlite');
    expect(readdirSync(t.service.dir())).toContain('my-own-copy.sqlite');
  });

  it('reports the newest backup, or null before the first', async () => {
    const t = setup();
    expect(t.service.latest()).toBeNull();
    await t.service.backup({}, new Date('2026-09-25T04:00:00Z'));
    await t.service.backup({}, new Date('2026-09-26T04:00:00Z'));
    expect(t.service.latest()).toMatchObject({
      file: 'mytube-2026-09-26T04:00:00Z.sqlite',
      at: '2026-09-26T04:00:00Z',
    });
  });
});
