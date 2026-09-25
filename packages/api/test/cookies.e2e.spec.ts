import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CookiesStatus, Settings } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

/** A made-up export: two YouTube cookies and one Google one. The values are not real. */
const COOKIES = [
  '# Netscape HTTP Cookie File',
  '.youtube.com\tTRUE\t/\tTRUE\t1800000000\tFAKE_NAME_ONE\tfake-secret-value-1',
  '.youtube.com\tTRUE\t/\tTRUE\t1790000000\tFAKE_NAME_TWO\tfake-secret-value-2',
  '.google.com\tTRUE\t/\tTRUE\t1810000000\tFAKE_NAME_THREE\tfake-secret-value-3',
  '',
].join('\n');

describe('Cookies (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let configDir: string;
  let managed: string;
  const server = () => app.getHttpServer();
  const put = (body: string, type = 'text/plain') =>
    request(server()).put('/api/system/cookies').set('Content-Type', type).send(body);
  const status = async () =>
    CookiesStatus.parse((await request(server()).get('/api/system/cookies').expect(200)).body);
  const settings = async () =>
    Settings.parse((await request(server()).get('/api/settings').expect(200)).body);

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-cookies-e2e-'));
    configDir = join(root, 'config');
    managed = join(configDir, 'cookies.txt');
    process.env.CONFIG_DIR = configDir;
    process.env.MUSIC_DIR = join(root, 'music');
    process.env.VIDEO_DIR = join(root, 'video');
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

  it('reports no cookies on a fresh install', async () => {
    expect(await status()).toEqual({
      managed: false,
      path: null,
      cookieCount: null,
      domains: [],
      updatedAt: null,
      expiresSoonest: null,
    });
  });

  it('stores an upload with mode 0600 and points the setting at it', async () => {
    const response = await put(COOKIES).expect(200);
    const body = CookiesStatus.parse(response.body);
    expect(body).toMatchObject({
      managed: true,
      path: managed,
      cookieCount: 3,
      domains: ['youtube.com', 'google.com'],
      expiresSoonest: new Date(1790000000 * 1000).toISOString(),
    });
    expect(body.updatedAt).not.toBeNull();
    // Nothing of the cookies themselves comes back.
    expect(response.text).not.toMatch(/FAKE_NAME|fake-secret/);

    expect(readFileSync(managed, 'utf8')).toBe(COOKIES);
    expect(statSync(managed).mode & 0o777).toBe(0o600);
    // The temp file was renamed, not left behind.
    expect(readdirSync(configDir).filter((name) => name.startsWith('.cookies-'))).toEqual([]);
    expect((await settings()).network.cookiesFile).toBe(managed);
    expect(await status()).toEqual(body);
  });

  it('accepts cookie lines without a header and writes one', async () => {
    const lines = '.youtube.com\tTRUE\t/\tTRUE\t1800000000\tFAKE\tv\r\n';
    const body = CookiesStatus.parse((await put(lines).expect(200)).body);
    expect(body.cookieCount).toBe(1);
    expect(readFileSync(managed, 'utf8')).toBe(
      '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1800000000\tFAKE\tv\n',
    );
  });

  it('refuses bad files and keeps the stored one', async () => {
    await put(COOKIES).expect(200);
    const notCookies = await put('{"some": "json"}').expect(400);
    expect(notCookies.body.message).toBe(
      'This is not a cookies file. Export it in Netscape (cookies.txt) format.',
    );
    const other = await put(
      '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tTRUE\t1800000000\tA\tb\n',
    ).expect(400);
    expect(other.body.message).toBe('This file has no YouTube or Google cookies.');
    const big = await put(`${COOKIES}${'#'.repeat(1024 * 1024)}`).expect(413);
    expect(big.body.message).toBe('The cookies file is larger than 1 MB.');
    await request(server())
      .put('/api/system/cookies')
      .set('Content-Type', 'application/json')
      .send({ text: COOKIES })
      .expect(415);
    expect(readFileSync(managed, 'utf8')).toBe(COOKIES);
    expect((await status()).cookieCount).toBe(3);
  });

  it('removes the managed file and clears the setting', async () => {
    await put(COOKIES).expect(200);
    const body = CookiesStatus.parse(
      (await request(server()).delete('/api/system/cookies').expect(200)).body,
    );
    expect(body).toMatchObject({ managed: false, path: null, cookieCount: null });
    expect(existsSync(managed)).toBe(false);
    expect((await settings()).network.cookiesFile).toBeNull();
    // Removing again is harmless.
    await request(server()).delete('/api/system/cookies').expect(200);
  });

  it('reports a path set by hand as unmanaged, and an upload replaces it', async () => {
    const own = join(root, 'my-cookies.txt');
    writeFileSync(own, COOKIES);
    await request(server())
      .patch('/api/settings')
      .send({ network: { cookiesFile: own } })
      .expect(200);
    expect(await status()).toMatchObject({ managed: false, path: own, cookieCount: 3 });

    // Remove only deals with the managed file: the setting and the user's file stay.
    await request(server()).delete('/api/system/cookies').expect(200);
    expect((await settings()).network.cookiesFile).toBe(own);
    expect(existsSync(own)).toBe(true);

    await put(COOKIES).expect(200);
    expect(await status()).toMatchObject({ managed: true, path: managed });
    expect(existsSync(own)).toBe(true);
  });

  it('reports a configured path whose file is missing without counts', async () => {
    const gone = join(root, 'gone.txt');
    await request(server())
      .patch('/api/settings')
      .send({ network: { cookiesFile: gone } })
      .expect(200);
    expect(await status()).toEqual({
      managed: false,
      path: gone,
      cookieCount: null,
      domains: [],
      updatedAt: null,
      expiresSoonest: null,
    });
  });
});
