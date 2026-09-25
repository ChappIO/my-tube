import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActivityModule } from '../activity/activity.module.js';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule } from '../database/database.module.js';
import type { DownloadProgress } from './progress.js';
import { YTDLP_BINARY, type YtdlpBinaryLocator } from './ytdlp-binary.js';
import { YtdlpError } from './ytdlp-error.js';
import { lineSplitter, YtdlpRunner } from './ytdlp-runner.js';
import { YtdlpModule } from './ytdlp.module.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
const FAKE_ENV = [
  'YTDLP_PATH',
  'FAKE_YTDLP_FAIL',
  'FAKE_YTDLP_EXIT',
  'FAKE_YTDLP_DELAY_MS',
  'FAKE_YTDLP_STDOUT',
  'FAKE_YTDLP_ARGS_FILE',
  'FAKE_YTDLP_VERSION',
] as const;

describe('YtdlpRunner (fake binary)', () => {
  let dir: string;
  let runner: YtdlpRunner;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-ytdlp-'));
    runner = new YtdlpRunner({ path: () => FAKE });
  });

  afterEach(() => {
    for (const key of FAKE_ENV) delete process.env[key];
    rmSync(dir, { recursive: true, force: true });
  });

  const receivedArgs = () =>
    z.array(z.string()).parse(JSON.parse(readFileSync(join(dir, 'args.json'), 'utf8')));

  it('reads the version', async () => {
    process.env.FAKE_YTDLP_VERSION = '2099.01.01';
    await expect(runner.version()).resolves.toBe('2099.01.01');
  });

  it('fetches channel metadata and passes network options', async () => {
    process.env.FAKE_YTDLP_ARGS_FILE = join(dir, 'args.json');
    const source = await runner.metadata('https://www.youtube.com/@NASA', {
      limit: 5,
      network: { rateLimit: '1M', proxy: 'http://proxy:3128', cookiesFile: '/c/cookies.txt' },
    });
    expect(source.kind).toBe('channel');
    expect(source.entries).toHaveLength(9);

    const args = receivedArgs();
    expect(args).toContain('--dump-single-json');
    expect(args.join(' ')).toContain(
      '--playlist-items 1:5 --extractor-args youtubetab:approximate_date --limit-rate 1M --proxy http://proxy:3128 --cookies /c/cookies.txt -- https://www.youtube.com/@NASA',
    );
  });

  it('fetches playlist metadata', async () => {
    const source = await runner.metadata('https://www.youtube.com/playlist?list=PLB29CbKaE2OY');
    expect(source.kind).toBe('playlist');
    expect(source.entries).toHaveLength(4);
  });

  it('maps unparseable output to an output error', async () => {
    process.env.FAKE_YTDLP_STDOUT = 'not json';
    const error = await runner.metadata('https://www.youtube.com/@NASA').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YtdlpError);
    expect(error).toMatchObject({ kind: 'output', exitCode: 0 });

    process.env.FAKE_YTDLP_STDOUT = '{"title": "no id"}';
    await expect(runner.metadata('https://www.youtube.com/@NASA')).rejects.toMatchObject({
      kind: 'output',
      message: expect.stringContaining('Unexpected yt-dlp metadata') as unknown,
    });
  });

  it('maps a failing run to an exit error with the stderr tail', async () => {
    process.env.FAKE_YTDLP_FAIL = '1';
    process.env.FAKE_YTDLP_EXIT = '2';
    const error = await runner
      .metadata('https://www.youtube.com/watch?v=gone')
      .catch((e: unknown) => e);
    if (!(error instanceof YtdlpError)) throw error;
    const ytdlpError = error;
    expect(ytdlpError.kind).toBe('exit');
    expect(ytdlpError.exitCode).toBe(2);
    expect(ytdlpError.stderrTail).toEqual([
      'WARNING: [youtube] Falling back to generic n function search',
      'ERROR: [youtube] gone: Video unavailable',
    ]);
    expect(ytdlpError.reason).toBe('[youtube] gone: Video unavailable');
    expect(ytdlpError.message).toBe('yt-dlp exited with 2: [youtube] gone: Video unavailable');
  });

  it('maps a missing binary to a spawn error', async () => {
    const missing = new YtdlpRunner({ path: () => join(dir, 'nope') });
    await expect(missing.version()).rejects.toMatchObject({ kind: 'spawn', exitCode: null });
  });

  it('downloads, streams progress and returns the final path', async () => {
    process.env.FAKE_YTDLP_ARGS_FILE = join(dir, 'args.json');
    const progress: DownloadProgress[] = [];
    const result = await runner.download(
      'https://www.youtube.com/watch?v=abc123',
      { output: join(dir, 'media', '%(title)s [%(id)s].%(ext)s'), format: 'bv*+ba/b' },
      (p) => progress.push(p),
    );

    expect(result.filePath).toBe(join(dir, 'media', 'Fake video [abc123].mp4'));
    expect(existsSync(result.filePath)).toBe(true);
    expect(progress.map((p) => p.status)).toEqual([
      'downloading',
      'downloading',
      'downloading',
      'downloading',
      'finished',
      'postprocessing',
      'postprocessing',
    ]);
    expect(progress[1]).toEqual({
      status: 'downloading',
      percent: 25,
      downloadedBytes: 750000,
      totalBytes: 3000000,
      speedBytesPerSec: 1048577,
      etaSeconds: 3,
      formatId: '18',
    });
    expect(progress.at(-1)?.postprocessor).toBe('MoveFiles');
    expect(receivedArgs()).toContain('bv*+ba/b');
  });

  it('kills the process when aborted', async () => {
    process.env.FAKE_YTDLP_DELAY_MS = '5000';
    const controller = new AbortController();
    const started = Date.now();
    const pending = runner.download('https://www.youtube.com/watch?v=slow', {
      output: join(dir, '%(id)s.%(ext)s'),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 200);
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(existsSync(join(dir, 'slow.mp4'))).toBe(false);
  });

  it('does not start when already aborted', async () => {
    process.env.FAKE_YTDLP_ARGS_FILE = join(dir, 'args.json');
    await expect(
      runner.metadata('https://www.youtube.com/@NASA', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(existsSync(join(dir, 'args.json'))).toBe(false);
  });
});

describe('YtdlpBinaryLocator', () => {
  it('is provided by YtdlpModule and can be overridden', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mytube-ytdlp-module-'));
    process.env.YTDLP_PATH = FAKE;
    process.env.CONFIG_DIR = configDir;
    const imports = [ConfigModule, DatabaseModule, ActivityModule, YtdlpModule];
    try {
      const moduleRef = await Test.createTestingModule({ imports }).compile();
      expect(moduleRef.get<YtdlpBinaryLocator>(YTDLP_BINARY).path()).toBe(FAKE);
      await expect(moduleRef.get(YtdlpRunner).version()).resolves.toBe('2026.08.19');

      const locator: YtdlpBinaryLocator = { path: () => '/elsewhere/yt-dlp' };
      const overridden = await Test.createTestingModule({ imports })
        .overrideProvider(YTDLP_BINARY)
        .useValue(locator)
        .compile();
      expect(overridden.get<YtdlpBinaryLocator>(YTDLP_BINARY).path()).toBe('/elsewhere/yt-dlp');
    } finally {
      delete process.env.YTDLP_PATH;
      delete process.env.CONFIG_DIR;
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});

describe('lineSplitter', () => {
  it('keeps multibyte characters split across chunks intact', () => {
    const lines: string[] = [];
    const splitter = lineSplitter((line) => lines.push(line));
    const bytes = Buffer.from('[mytube-file] /media/Café — 日本語.mkv\r\nnext', 'utf8');
    // Split inside the three-byte encoding of 日.
    const cut = bytes.indexOf(Buffer.from('日', 'utf8')) + 1;
    splitter.push(bytes.subarray(0, cut));
    splitter.push(bytes.subarray(cut));
    splitter.end();
    expect(lines).toEqual(['[mytube-file] /media/Café — 日本語.mkv', 'next']);
  });
});
