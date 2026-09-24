import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { YtdlpStatus } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('yt-dlp manager (e2e)', () => {
  let app: INestApplication;
  let configDir: string;
  const requested: string[] = [];

  beforeAll(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'mytube-ytdlp-e2e-'));
    process.env.CONFIG_DIR = configDir;
    delete process.env.YTDLP_PATH;
    // GitHub never answers: the first install stays in flight until the app shuts down.
    vi.stubGlobal(
      'fetch',
      (input: string | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          requested.push(String(input));
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('boots on a fresh CONFIG_DIR and starts installing without blocking', async () => {
    await vi.waitFor(() => expect(requested).toHaveLength(1));
    expect(requested[0]).toContain('api.github.com/repos/yt-dlp/yt-dlp/releases/latest');

    const response = await request(app.getHttpServer()).get('/api/ytdlp/status').expect(200);
    const status = YtdlpStatus.parse(response.body);
    expect(status).toMatchObject({
      installed: false,
      installedVersion: null,
      state: 'installing',
      autoUpdate: true,
      updateIntervalHours: 6,
    });
  });

  it('status follows the auto-update setting', async () => {
    const server = app.getHttpServer();
    await request(server)
      .patch('/api/settings')
      .send({ ytdlp: { autoUpdate: false } })
      .expect(200);
    const response = await request(server).get('/api/ytdlp/status').expect(200);
    expect(YtdlpStatus.parse(response.body).autoUpdate).toBe(false);
  });

  it('creates the history and ytdlp_state tables', async () => {
    const { default: BetterSqlite3 } = await import('better-sqlite3');
    const db = new BetterSqlite3(join(configDir, 'mytube.db'), { readonly: true });
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    db.close();
    expect(names).toEqual(expect.arrayContaining(['history', 'ytdlp_state']));
  });
});
