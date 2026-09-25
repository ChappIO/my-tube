import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import { JOB_LOG_MAX_LINE, JobLogsService, logTimestamp } from './job-logs.service.js';

describe('JobLogsService', () => {
  let dir: string;
  let logs: JobLogsService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mytube-joblogs-'));
    logs = new JobLogsService(new AppConfig({ CONFIG_DIR: dir }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('appends one header per attempt, then the lines, cutting very long ones', () => {
    const { jobs } = createJobsHarness();
    const job = jobs.enqueue({ type: 'download', payload: { title: 'Clip' } }).job;
    const first = logs.open(job);
    first.line('$ yt-dlp --cookies <redacted> -- https://www.youtube.com/watch?v=x');
    first.line('x'.repeat(JOB_LOG_MAX_LINE + 10));
    first.close();
    first.line('after close is ignored');
    const second = logs.open({ ...job, attempts: 1 });
    second.close();

    expect(logs.path(job.id)).toBe(join(dir, 'logs', 'jobs', `${job.id}.log`));
    expect(logs.exists(job.id)).toBe(true);
    const lines = readFileSync(logs.path(job.id), 'utf8').trimEnd().split('\n');
    expect(lines[0]).toMatch(/^=== download job 1 · attempt 1 of 3 · .* · Clip$/);
    expect(lines[1]).toMatch(/^\d\d:\d\d:\d\d\.\d{3} \$ yt-dlp --cookies <redacted> /);
    expect(lines[2]).toMatch(/^\d\d:\d\d:\d\d\.\d{3} x+ … \(10 more characters\)$/);
    expect(lines[3]).toMatch(/attempt 2 of 3/);
    expect(lines).toHaveLength(4);
  });

  it('stamps every line after the header with the local time of the jobs clock', () => {
    let at = new Date(2026, 8, 25, 9, 5, 7, 42);
    const clocked = new JobLogsService(new AppConfig({ CONFIG_DIR: dir }), () => at);
    const { jobs } = createJobsHarness();
    const job = jobs.enqueue({ type: 'download', payload: { title: 'Clip' } }).job;
    const log = clocked.open(job);
    log.line('[download]  12.0% of 10.00MiB');
    at = new Date(2026, 8, 25, 23, 59, 59, 999);
    log.line('');
    log.close();

    const lines = readFileSync(clocked.path(job.id), 'utf8').split('\n');
    expect(lines[0]).toContain(` · ${new Date(2026, 8, 25, 9, 5, 7, 42).toISOString()} · Clip`);
    expect(lines[1]).toBe('09:05:07.042 [download]  12.0% of 10.00MiB');
    expect(lines[2]).toBe('23:59:59.999 ');
  });

  it('formats the prefix at a fixed width', () => {
    expect(logTimestamp(new Date(2026, 0, 1, 0, 0, 0, 0))).toBe('00:00:00.000 ');
    expect(logTimestamp(new Date(2026, 0, 1, 13, 4, 9, 7))).toBe('13:04:09.007 ');
    expect(logTimestamp(new Date(2026, 0, 1, 13, 4, 9, 7))).toHaveLength(13);
  });

  it('keeps only the newest logs', () => {
    const folder = join(dir, 'logs', 'jobs');
    const { jobs } = createJobsHarness();
    logs.open(jobs.enqueue({ type: 'rescan', payload: { title: 'x' } }).job).close();
    for (let id = 2; id <= 6; id++) {
      const path = join(folder, `${id}.log`);
      writeFileSync(path, 'x');
      const at = new Date(Date.UTC(2026, 0, id));
      utimesSync(path, at, at);
    }
    writeFileSync(join(folder, 'notes.txt'), 'not a job log');

    expect(logs.prune(3)).toBe(3);
    expect(readdirSync(folder).toSorted()).toEqual(['1.log', '5.log', '6.log', 'notes.txt']);
    expect(logs.prune(3)).toBe(0);
  });

  it('prunes nothing when the folder does not exist yet', () => {
    expect(logs.prune()).toBe(0);
  });
});
