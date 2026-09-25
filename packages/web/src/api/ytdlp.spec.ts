import type { YtdlpStatus } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { isYtdlpBusy, ytdlpSummary } from './ytdlp';

const status: YtdlpStatus = {
  installed: true,
  installedVersion: '2026.09.22',
  latestVersion: '2026.09.22',
  lastCheckedAt: null,
  lastUpdatedAt: null,
  autoUpdate: true,
  updateIntervalHours: 6,
  state: 'up_to_date',
  error: null,
};

describe('ytdlpSummary', () => {
  it('reads like the sidebar footer', () => {
    expect(ytdlpSummary(status)).toBe('up to date · auto-update on');
    expect(ytdlpSummary({ ...status, state: 'update_available', autoUpdate: false })).toBe(
      'update available · auto-update off',
    );
    expect(ytdlpSummary({ ...status, state: 'installing' })).toBe('installing… · auto-update on');
  });
});

describe('isYtdlpBusy', () => {
  it('is true while installing or updating', () => {
    expect(isYtdlpBusy('installing')).toBe(true);
    expect(isYtdlpBusy('updating')).toBe(true);
    expect(isYtdlpBusy('error')).toBe(false);
  });
});
