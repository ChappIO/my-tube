import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SystemActionResult, SystemInfo } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('System (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let configDir: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-system-e2e-'));
    configDir = join(root, 'config');
    process.env.CONFIG_DIR = configDir;
    process.env.MUSIC_DIR = join(root, 'music');
    process.env.VIDEO_DIR = join(root, 'video');
    process.env.APP_VERSION = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MUSIC_DIR;
    delete process.env.VIDEO_DIR;
    rmSync(root, { recursive: true, force: true });
  });

  it('GET /api/system/info returns the env paths and version', async () => {
    const response = await request(app.getHttpServer()).get('/api/system/info').expect(200);
    const info = SystemInfo.parse(response.body);
    expect(info).toEqual({
      version: 'test',
      configDir,
      musicDir: join(root, 'music'),
      videoDir: join(root, 'video'),
      platform: `${process.platform} ${process.arch}`,
    });
  });

  it.each(['backup', 'rescan'])(
    'POST /api/system/%s is a 501 stub until Stage 7',
    async (action) => {
      const response = await request(app.getHttpServer()).post(`/api/system/${action}`).expect(501);
      expect(SystemActionResult.parse(response.body)).toEqual({
        message: 'Not implemented until Stage 7',
      });
    },
  );

  it('GET /api/system/logs explains stdout when there is no log file', async () => {
    const response = await request(app.getHttpServer()).get('/api/system/logs').expect(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.headers['content-disposition']).toBe('attachment; filename="mytube.log"');
    expect(response.text).toContain('stdout');
  });

  it('GET /api/system/logs streams the log file when it exists', async () => {
    mkdirSync(join(configDir, 'logs'), { recursive: true });
    writeFileSync(join(configDir, 'logs', 'mytube.log'), 'line one\nline two\n');
    const response = await request(app.getHttpServer()).get('/api/system/logs').expect(200);
    expect(response.headers['content-disposition']).toBe('attachment; filename="mytube.log"');
    expect(response.text).toBe('line one\nline two\n');
  });
});
