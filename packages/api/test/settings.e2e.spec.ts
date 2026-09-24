import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_SETTINGS, Settings } from '@mytube/shared';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

async function startApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('Settings (e2e)', () => {
  let app: INestApplication;
  let configDir: string;

  beforeAll(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'mytube-settings-e2e-'));
    process.env.CONFIG_DIR = configDir;
    app = await startApp();
  });

  afterAll(async () => {
    await app.close();
    rmSync(configDir, { recursive: true, force: true });
  });

  it('GET /api/settings returns the defaults on a fresh install', async () => {
    const response = await request(app.getHttpServer()).get('/api/settings').expect(200);
    expect(Settings.parse(response.body)).toEqual(DEFAULT_SETTINGS);
  });

  it('PATCH /api/settings changes the given fields and GET returns them', async () => {
    const patched = await request(app.getHttpServer())
      .patch('/api/settings')
      .send({ general: { theme: 'dark', checkIntervalHours: 12, downloadsAtOnce: 4 } })
      .expect(200);
    expect(Settings.parse(patched.body).general).toEqual({
      theme: 'dark',
      checkIntervalHours: 12,
      downloadsAtOnce: 4,
    });

    const response = await request(app.getHttpServer()).get('/api/settings').expect(200);
    const settings = Settings.parse(response.body);
    expect(settings.general.checkIntervalHours).toBe(12);
    expect(settings.video).toEqual(DEFAULT_SETTINGS.video);
  });

  it('PATCH /api/settings rejects invalid bodies with 400', async () => {
    const server = app.getHttpServer();
    const bodies = [{}, { general: { downloadsAtOnce: 9 } }, { general: { unknown: true } }];
    for (const body of bodies) {
      const response = await request(server).patch('/api/settings').send(body);
      expect(response.status).toBe(400);
    }
    const after = await request(server).get('/api/settings').expect(200);
    expect(Settings.parse(after.body).general.downloadsAtOnce).toBe(4);
  });

  it('PATCH /api/settings rejects unknown folder structure tags, naming them', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/settings')
      .send({ video: { pathTemplate: '{channel}/{bogus} {title}' } })
      .expect(400);
    const body = z
      .object({ issues: z.array(z.object({ message: z.string() })) })
      .parse(response.body);
    expect(body.issues[0]?.message).toBe('Unknown tag {bogus}.');
  });

  it('a restarted app on the same CONFIG_DIR sees the changed values', async () => {
    await app.close();
    app = await startApp();
    const response = await request(app.getHttpServer()).get('/api/settings').expect(200);
    expect(Settings.parse(response.body).general).toEqual({
      theme: 'dark',
      checkIntervalHours: 12,
      downloadsAtOnce: 4,
    });
  });
});
