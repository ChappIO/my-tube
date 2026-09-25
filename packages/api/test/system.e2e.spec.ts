import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  BACKUP_KEEP,
  HistoryEntry,
  MaintenanceStatus,
  SystemActionResult,
  SystemInfo,
  VideoPage,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { channels, jobs, videos } from '../src/database/schema.js';

describe('System (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let configDir: string;
  let db: Database;
  const server = () => app.getHttpServer();
  const status = async () =>
    MaintenanceStatus.parse(
      (await request(server()).get('/api/system/maintenance').expect(200)).body,
    );
  const history = async () =>
    z.array(HistoryEntry).parse((await request(server()).get('/api/activity/history')).body);
  /** A job of `type` that the worker will not touch, standing in for one in progress. */
  const busy = (type: 'backup' | 'rescan') =>
    db
      .insert(jobs)
      .values({ type, status: 'running', dedupeKey: type, payload: { title: type } })
      .returning()
      .get();
  const finish = (id: number) =>
    db.update(jobs).set({ status: 'cancelled' }).where(eq(jobs.id, id)).run();

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
    db = app.get(DATABASE);
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

  it('GET /api/system/maintenance is empty on a fresh install', async () => {
    expect(await status()).toEqual({
      libraries: { music: { sizeBytes: 0, itemCount: 0 }, video: { sizeBytes: 0, itemCount: 0 } },
      rescan: { active: false, lastAt: null },
      backup: { active: false, last: null, keep: BACKUP_KEEP },
    });
  });

  it('POST /api/system/backup answers 409 while a backup runs, else 202 and backs up', async () => {
    const running = busy('backup');
    const conflict = await request(server()).post('/api/system/backup').expect(409);
    expect(SystemActionResult.parse(conflict.body)).toEqual({
      message: 'A backup is already running.',
      jobId: running.id,
    });
    expect((await status()).backup.active).toBe(true);
    finish(running.id);

    const queued = await request(server()).post('/api/system/backup').expect(202);
    const answer = SystemActionResult.parse(queued.body);
    expect(answer.message).toBe('Backup queued.');
    expect(answer.jobId).toBeGreaterThan(running.id);

    await vi.waitFor(async () => expect((await status()).backup.last).not.toBeNull(), {
      timeout: 5000,
    });
    const { backup } = await status();
    expect(backup.active).toBe(false);
    expect(backup.last?.file).toMatch(/^mytube-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\.sqlite$/);
    expect(existsSync(join(configDir, 'backups', backup.last!.file))).toBe(true);
    const row = (await history()).find((entry) => entry.title.startsWith('backup · '));
    expect(row).toMatchObject({ kind: 'system', result: 'done', jobId: answer.jobId });
    expect(row?.title).toContain(backup.last!.file);
  });

  it('POST /api/system/rescan answers 409 while one is queued, else 202 and finds a deleted file', async () => {
    const videoDir = join(root, 'video');
    mkdirSync(join(videoDir, 'NASA'), { recursive: true });
    writeFileSync(join(videoDir, 'NASA', 'Kept.mkv'), 'x'.repeat(1000));
    writeFileSync(join(videoDir, 'NASA', 'Deleted.mkv'), 'x'.repeat(500));
    const channel = db
      .insert(channels)
      .values({ youtubeId: 'UCn', name: 'NASA' })
      .returning()
      .get();
    for (const name of ['Kept', 'Deleted']) {
      db.insert(videos)
        .values({
          channelId: channel.id,
          youtubeId: name,
          title: name,
          status: 'on_disk',
          filePath: `NASA/${name}.mkv`,
          fileSizeBytes: name === 'Kept' ? 1000 : 500,
        })
        .run();
    }
    expect((await status()).libraries.video).toEqual({ sizeBytes: 1500, itemCount: 2 });
    // Deleted outside the app.
    rmSync(join(videoDir, 'NASA', 'Deleted.mkv'));

    const running = busy('rescan');
    const conflict = await request(server()).post('/api/system/rescan').expect(409);
    expect(SystemActionResult.parse(conflict.body).message).toBe('A rescan is already running.');
    finish(running.id);

    const queued = await request(server()).post('/api/system/rescan').expect(202);
    const answer = SystemActionResult.parse(queued.body);
    expect(answer.message).toBe('Rescan queued.');

    await vi.waitFor(async () => expect((await status()).rescan.lastAt).not.toBeNull(), {
      timeout: 5000,
    });
    expect((await status()).libraries.video).toEqual({ sizeBytes: 1000, itemCount: 1 });
    const all = VideoPage.parse(
      (await request(server()).get('/api/library/videos?status=all').expect(200)).body,
    );
    expect(Object.fromEntries(all.items.map((video) => [video.title, video.status]))).toEqual({
      Kept: 'on_disk',
      Deleted: 'missing',
    });
    const row = (await history()).find((entry) => entry.title.startsWith('rescan · '));
    expect(row).toMatchObject({
      kind: 'system',
      result: 'done',
      title: 'rescan · 0 tracks, 1 video on disk · 1 missing · 1 KB',
      details: '1 newly missing',
      jobId: answer.jobId,
    });
  });

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
