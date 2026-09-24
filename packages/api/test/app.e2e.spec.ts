import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponse } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('App (e2e)', () => {
  let app: INestApplication;
  let configDir: string;

  beforeAll(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'mytube-e2e-'));
    process.env.CONFIG_DIR = configDir;
    process.env.APP_VERSION = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('GET /api/health matches the shared schema', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = HealthResponse.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('test');
  });

  it('creates and migrates the database in CONFIG_DIR', async () => {
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    const db = new BetterSqlite3(join(configDir, 'mytube.db'), { readonly: true });
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    db.close();
    expect(names).toContain('migrations');
    expect(names).toContain('settings');
  });
});
