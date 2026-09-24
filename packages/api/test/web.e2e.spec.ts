import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('Web app serving (e2e)', () => {
  let app: INestApplication;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-web-'));
    // A dot-directory in the path: Express refuses such files unless told otherwise.
    const dist = join(root, '.hidden', 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>MyTube</title>');
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.WEB_DIST = dist;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.WEB_DIST;
    rmSync(root, { recursive: true, force: true });
  });

  it('serves index.html at the root', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('MyTube');
  });

  it('serves static assets', async () => {
    const response = await request(app.getHttpServer()).get('/assets/app.js').expect(200);
    expect(response.text).toBe('console.log(1)');
  });

  it('falls back to index.html for deep links', async () => {
    const response = await request(app.getHttpServer()).get('/settings/advanced').expect(200);
    expect(response.type).toBe('text/html');
  });

  it('leaves the API alone', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    const missing = await request(app.getHttpServer()).get('/api/nope').expect(404);
    expect(missing.type).toBe('application/json');
  });
});
