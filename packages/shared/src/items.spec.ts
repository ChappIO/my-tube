import { describe, expect, it } from 'vitest';
import { ITEM_STATUSES, JOB_TYPES, Job } from './items.js';

const job = {
  id: 1,
  type: 'download',
  status: 'running',
  title: 'Hand-cut dovetails',
  subtitle: 'Woodshop',
  progress: 0.5,
  speedBytesPerSec: 1_000_000,
  etaSeconds: 12,
  totalBytes: 3_000_000,
  detail: '1080p',
  error: null,
  attempts: 0,
  maxAttempts: 3,
  runAfter: null,
  createdAt: '2026-09-24T12:00:00.000Z',
  startedAt: '2026-09-24T12:00:01.000Z',
  finishedAt: null,
  updatedAt: '2026-09-24T12:00:02.000Z',
};

describe('items', () => {
  it('lists the status and job type enums from the architecture', () => {
    expect(ITEM_STATUSES).toEqual(['wanted', 'downloading', 'on_disk', 'missing', 'skipped']);
    expect(JOB_TYPES).toEqual(['download', 'check_source', 'revalidate', 'rescan', 'backup']);
  });

  it('parses a queue row and rejects out-of-range progress', () => {
    expect(Job.parse(job)).toEqual(job);
    expect(Job.safeParse({ ...job, progress: 1.5 }).success).toBe(false);
    expect(Job.safeParse({ ...job, type: 'other' }).success).toBe(false);
  });
});
