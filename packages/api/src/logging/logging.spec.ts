import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLogger, nestLogLevels } from './app-logger.js';
import { RotatingFile } from './rotating-file.js';

describe('RotatingFile', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-log-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates the folder, appends, and rotates by size keeping N older files', () => {
    const path = join(dir, 'logs', 'mytube.log');
    const file = new RotatingFile(path, { maxBytes: 20, keep: 2 });
    for (const n of [1, 2, 3, 4, 5, 6, 7]) file.write(`line ${n} ........\n`); // 16 bytes each
    file.close();

    expect(readdirSync(join(dir, 'logs')).toSorted()).toEqual([
      'mytube.log',
      'mytube.log.1',
      'mytube.log.2',
    ]);
    expect(readFileSync(path, 'utf8')).toBe('line 7 ........\n');
    expect(readFileSync(`${path}.1`, 'utf8')).toBe('line 6 ........\n');
    expect(readFileSync(`${path}.2`, 'utf8')).toBe('line 5 ........\n');
  });

  it('continues an existing file and counts its size', () => {
    const path = join(dir, 'app.log');
    new RotatingFile(path, { maxBytes: 30 }).write('0123456789\n');
    const again = new RotatingFile(path, { maxBytes: 30 });
    again.write('0123456789\n');
    again.write('0123456789\n'); // would reach 33 bytes: rotates first
    again.close();
    expect(readFileSync(path, 'utf8')).toBe('0123456789\n');
    expect(readFileSync(`${path}.1`, 'utf8')).toBe('0123456789\n0123456789\n');
  });

  it('reports a write error once and never throws', () => {
    const onError = vi.fn<(error: unknown) => void>();
    const file = new RotatingFile(join(dir, 'missing\0name', 'x.log'), {}, onError);
    expect(() => {
      file.write('a\n');
      file.write('b\n');
    }).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('AppLogger', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-applog-'));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps the Settings levels to Nest levels', () => {
    expect(nestLogLevels('error')).toEqual(['fatal', 'error']);
    expect(nestLogLevels('info')).toContain('log');
    expect(nestLogLevels('info')).not.toContain('debug');
    expect(nestLogLevels('debug')).toContain('verbose');
  });

  it('writes enabled messages to the file as plain lines and honours the level', () => {
    const path = join(dir, 'logs', 'mytube.log');
    const logger = new AppLogger(path);
    logger.log('listening', 'Bootstrap');
    logger.debug('hidden at info', 'Runner');
    logger.setLevel('debug');
    logger.debug('shown at debug', 'Runner');
    logger.error('boom', 'Error: boom\n    at x (y.ts:1:1)', 'Jobs');
    logger.setLevel('error');
    logger.warn('hidden at error');
    logger.close();

    const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
    expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z INFO  \[Bootstrap\] listening$/);
    expect(lines[1]).toMatch(/ DEBUG \[Runner\] shown at debug$/);
    expect(lines[2]).toMatch(/ ERROR \[Jobs\] boom$/);
    expect(lines[3]).toBe('Error: boom');
    expect(lines).toHaveLength(5);
    expect(readFileSync(path, 'utf8')).not.toContain('hidden');
    // The file never gets terminal colours.
    expect(readFileSync(path, 'utf8')).not.toContain('\u001b[');
  });

  it('does not create a file until something is logged', () => {
    const path = join(dir, 'quiet.log');
    new AppLogger(path).close();
    expect(existsSync(path)).toBe(false);
  });
});
