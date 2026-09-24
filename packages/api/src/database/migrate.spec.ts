import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listMigrationFiles, runMigrations } from './migrate.js';

describe('runMigrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-migrations-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies files in name order exactly once', () => {
    writeFileSync(join(dir, '20260102000000_second.sql'), 'INSERT INTO t (v) VALUES (2);');
    writeFileSync(join(dir, '20260101000000_first.sql'), 'CREATE TABLE t (v INTEGER);');
    const db = new Database(':memory:');

    const first = runMigrations(db, dir);
    expect(first.applied).toEqual(['20260101000000_first.sql', '20260102000000_second.sql']);
    expect(first.skipped).toBe(0);

    const second = runMigrations(db, dir);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toBe(2);
    expect(db.prepare('SELECT v FROM t').pluck().all()).toEqual([2]);
  });

  it('rolls back a failing migration and does not record it', () => {
    writeFileSync(
      join(dir, '20260101000000_broken.sql'),
      'CREATE TABLE t (v INTEGER); INSERT INTO nope (v) VALUES (1);',
    );
    const db = new Database(':memory:');

    expect(() => runMigrations(db, dir)).toThrow(/no such table: nope/);
    expect(db.prepare('SELECT count(*) FROM migrations').pluck().get()).toBe(0);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 't'").all()).toEqual([]);
  });

  it('rejects badly named files', () => {
    writeFileSync(join(dir, 'init.sql'), 'SELECT 1;');
    expect(() => listMigrationFiles(dir)).toThrow(/must be named/);
  });
});
