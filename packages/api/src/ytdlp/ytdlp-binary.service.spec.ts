import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryService } from '../activity/history.service.js';
import { AppConfig } from '../config/app-config.js';
import { MIGRATIONS_DIR, openDatabase, type Database } from '../database/database.module.js';
import { runMigrations } from '../database/migrate.js';
import { SettingsService } from '../settings/settings.service.js';
import { GithubReleases, LATEST_RELEASE_URL } from './github-releases.js';
import { assetNameFor } from './release.js';
import { YtdlpBinaryService } from './ytdlp-binary.service.js';

const ASSET = assetNameFor(process.platform, process.arch);
const BINARY_URL = `https://github.test/download/${ASSET}`;
const SUMS_URL = 'https://github.test/download/SHA2-256SUMS';

/** A tiny executable that behaves like `yt-dlp --version`. */
const fakeBinary = (version: string) => `#!/bin/sh\necho ${version}\n`;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

interface FakeGithub {
  version: string;
  binary: string;
  sums: string | null;
  /** Fail the release lookup with this status. */
  status?: number;
  /** Hold the binary download until this settles. */
  gate?: Promise<void>;
  calls: string[];
}

function fakeGithub(version: string): FakeGithub {
  const binary = fakeBinary(version);
  return { version, binary, sums: `${sha256(binary)}  ${ASSET}\n`, calls: [] };
}

/** Stubs `fetch` with GitHub's latest-release API, the binary and the checksum file. */
function stubFetch(github: FakeGithub): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    github.calls.push(url);
    if (url === LATEST_RELEASE_URL) {
      if (github.status) return new Response('{}', { status: github.status });
      const assets = [{ name: ASSET, browser_download_url: BINARY_URL }];
      if (github.sums !== null)
        assets.push({ name: 'SHA2-256SUMS', browser_download_url: SUMS_URL });
      return Response.json({ tag_name: github.version, assets });
    }
    if (url === BINARY_URL) {
      await github.gate;
      return new Response(github.binary);
    }
    if (url === SUMS_URL && github.sums !== null) return new Response(github.sums);
    return new Response('not found', { status: 404 });
  });
}

describe('YtdlpBinaryService', () => {
  let configDir: string;
  let db: Database;
  let close: () => void;
  let settings: SettingsService;
  let history: HistoryService;
  let service: YtdlpBinaryService;
  const binaryPath = () => join(configDir, 'bin', 'yt-dlp');

  const create = () =>
    new YtdlpBinaryService(
      new AppConfig({ CONFIG_DIR: configDir }),
      db,
      settings,
      history,
      new GithubReleases(),
    );

  const preinstall = (version: string) => {
    mkdirSync(join(configDir, 'bin'), { recursive: true });
    writeFileSync(binaryPath(), fakeBinary(version));
    chmodSync(binaryPath(), 0o755);
  };

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'mytube-binary-'));
    const opened = openDatabase(':memory:');
    runMigrations(opened.client, MIGRATIONS_DIR);
    db = opened.db;
    close = () => opened.client.close();
    settings = new SettingsService(db);
    history = new HistoryService(db);
    delete process.env.YTDLP_PATH;
    service = create();
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.unstubAllGlobals();
    close();
    delete process.env.YTDLP_PATH;
    rmSync(configDir, { recursive: true, force: true });
  });

  it('locates the binary in CONFIG_DIR/bin', () => {
    expect(service.path()).toBe(binaryPath());
  });

  it('reports not_installed on a fresh config', () => {
    expect(service.status()).toMatchObject({
      installed: false,
      installedVersion: null,
      state: 'not_installed',
      autoUpdate: true,
      updateIntervalHours: 6,
      error: null,
    });
  });

  it('installs the latest release, verified, and records it', async () => {
    const github = fakeGithub('2026.09.22');
    stubFetch(github);

    const status = await service.update();

    expect(status).toMatchObject({
      installed: true,
      installedVersion: '2026.09.22',
      latestVersion: '2026.09.22',
      state: 'up_to_date',
      error: null,
    });
    expect(status.lastCheckedAt).not.toBeNull();
    expect(status.lastUpdatedAt).not.toBeNull();
    expect(statSync(binaryPath()).mode & 0o777).toBe(0o755);
    // No temp files left next to the binary.
    expect(readdirSync(join(configDir, 'bin'))).toEqual(['yt-dlp']);
    expect(github.calls).toEqual([LATEST_RELEASE_URL, BINARY_URL, SUMS_URL]);
    expect(history.recent()).toMatchObject([
      { kind: 'system', title: 'yt-dlp 2026.09.22 installed', result: 'installed', details: null },
    ]);
  });

  it('installs on boot when there is no binary', async () => {
    stubFetch(fakeGithub('2026.09.22'));
    await service.boot();
    expect(service.status()).toMatchObject({ installedVersion: '2026.09.22', state: 'up_to_date' });
  });

  it('reads the installed version on boot and updates when a newer release exists', async () => {
    preinstall('2026.08.19');
    stubFetch(fakeGithub('2026.09.22'));

    await service.boot();

    expect(service.status()).toMatchObject({
      installedVersion: '2026.09.22',
      state: 'up_to_date',
    });
    expect(history.recent()).toMatchObject([
      { kind: 'system', title: 'yt-dlp 2026.08.19 → 2026.09.22', result: 'updated' },
    ]);
  });

  it('check reports an available update without installing it', async () => {
    preinstall('2026.08.19');
    settings.patch({ ytdlp: { autoUpdate: false } });
    await service.boot();
    stubFetch(fakeGithub('2026.09.22'));

    const status = await service.check();

    expect(status).toMatchObject({
      installedVersion: '2026.08.19',
      latestVersion: '2026.09.22',
      state: 'update_available',
      autoUpdate: false,
    });
    expect(history.recent()).toEqual([]);
  });

  it('does nothing when up to date, and reinstalls with force', async () => {
    preinstall('2026.09.22');
    settings.patch({ ytdlp: { autoUpdate: false } });
    await service.boot();
    const github = fakeGithub('2026.09.22');
    stubFetch(github);

    await service.update();
    expect(github.calls).toEqual([LATEST_RELEASE_URL]);
    expect(history.recent()).toEqual([]);

    await service.update({ force: true });
    expect(github.calls).toContain(BINARY_URL);
    expect(history.recent()).toMatchObject([{ title: 'yt-dlp 2026.09.22 installed' }]);
  });

  it('fails the install on a checksum mismatch and leaves nothing behind', async () => {
    const github = fakeGithub('2026.09.22');
    github.sums = `${sha256('something else')}  ${ASSET}\n`;
    stubFetch(github);

    await expect(service.update()).rejects.toThrow(/Checksum mismatch/);

    expect(existsSync(binaryPath())).toBe(false);
    expect(readdirSync(join(configDir, 'bin'))).toEqual([]);
    expect(service.status()).toMatchObject({ installed: false, state: 'error' });
    expect(service.status().error).toMatch(/Checksum mismatch/);
    expect(history.recent()).toMatchObject([
      { kind: 'system', title: 'yt-dlp 2026.09.22 install failed', result: 'failed' },
    ]);
  });

  it('keeps the old binary when the new one does not run', async () => {
    preinstall('2026.08.19');
    settings.patch({ ytdlp: { autoUpdate: false } });
    await service.boot();
    const github = fakeGithub('2026.09.22');
    github.binary = '#!/bin/sh\nexit 3\n';
    github.sums = `${sha256(github.binary)}  ${ASSET}\n`;
    stubFetch(github);

    await expect(service.update()).rejects.toThrow();

    expect(service.status()).toMatchObject({ installedVersion: '2026.08.19', state: 'error' });
    expect(readdirSync(join(configDir, 'bin'))).toEqual(['yt-dlp']);
    expect(history.recent()).toMatchObject([
      { title: 'yt-dlp update to 2026.09.22 failed', result: 'failed' },
    ]);
  });

  it('installs without verification when the release has no checksum file', async () => {
    const github = fakeGithub('2026.09.22');
    github.sums = null;
    stubFetch(github);
    await expect(service.update()).resolves.toMatchObject({ installedVersion: '2026.09.22' });
  });

  it('records a failed lookup once, not on every retry', async () => {
    const github = fakeGithub('2026.09.22');
    github.status = 500;
    stubFetch(github);

    await service.boot();
    await service.tick();

    expect(service.status()).toMatchObject({ installed: false, state: 'error' });
    expect(service.status().error).toMatch(/500/);
    expect(history.recent()).toMatchObject([{ title: 'yt-dlp install failed', result: 'failed' }]);

    // Recovers on the next tick.
    github.status = undefined;
    await service.tick();
    expect(service.status()).toMatchObject({ installedVersion: '2026.09.22', error: null });
  });

  it('runs one operation at a time', async () => {
    const github = fakeGithub('2026.09.22');
    stubFetch(github);

    const [first, second] = await Promise.all([service.update(), service.update()]);

    expect(first.installedVersion).toBe('2026.09.22');
    expect(second.installedVersion).toBe('2026.09.22');
    expect(github.calls.filter((url) => url === BINARY_URL)).toHaveLength(1);
  });

  it('shows installing while the first install runs', async () => {
    const github = fakeGithub('2026.09.22');
    const gate: { open?: () => void } = {};
    github.gate = new Promise<void>((resolve) => (gate.open = resolve));
    stubFetch(github);
    const running = service.update();
    await vi.waitFor(() => expect(github.calls).toContain(BINARY_URL));
    expect(service.status().state).toBe('installing');
    gate.open?.();
    await running;
    expect(service.status().state).toBe('up_to_date');
  });

  it('only checks on the tick when auto-update is on and the interval has passed', async () => {
    preinstall('2026.09.22');
    const github = fakeGithub('2026.09.22');
    stubFetch(github);
    settings.patch({ ytdlp: { autoUpdate: false } });

    await service.boot();
    expect(github.calls).toEqual([]);

    settings.patch({ ytdlp: { autoUpdate: true } });
    await service.tick();
    expect(github.calls).toEqual([LATEST_RELEASE_URL]);

    // Checked just now: not due again within the interval.
    await service.tick();
    expect(github.calls).toHaveLength(1);
  });

  it('uses YTDLP_PATH as is and refuses to update it', async () => {
    const external = join(configDir, 'external-yt-dlp');
    writeFileSync(external, fakeBinary('2026.01.01'));
    chmodSync(external, 0o755);
    process.env.YTDLP_PATH = external;
    service = create();
    const github = fakeGithub('2026.09.22');
    stubFetch(github);

    await service.boot();

    expect(service.path()).toBe(external);
    expect(service.status()).toMatchObject({ installedVersion: '2026.01.01' });
    expect(github.calls).toEqual([]);
    await expect(service.update()).rejects.toBeInstanceOf(ConflictException);
  });
});
