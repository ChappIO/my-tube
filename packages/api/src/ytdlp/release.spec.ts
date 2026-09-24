import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assetNameFor,
  compareVersions,
  GithubRelease,
  isCheckDue,
  parseChecksum,
  releaseAssets,
  sha256File,
  UnsupportedPlatformError,
} from './release.js';

describe('assetNameFor', () => {
  it('picks the standalone build per platform', () => {
    expect(assetNameFor('linux', 'x64')).toBe('yt-dlp_linux');
    expect(assetNameFor('linux', 'arm64')).toBe('yt-dlp_linux_aarch64');
    expect(assetNameFor('darwin', 'arm64')).toBe('yt-dlp_macos');
    expect(assetNameFor('darwin', 'x64')).toBe('yt-dlp_macos');
  });

  it('rejects other platforms with a clear error', () => {
    expect(() => assetNameFor('win32', 'x64')).toThrow(UnsupportedPlatformError);
    expect(() => assetNameFor('linux', 'arm')).toThrow(/linux\/arm.*YTDLP_PATH/);
  });
});

const hash = (char: string) => char.repeat(64);

describe('parseChecksum', () => {
  const sums = [
    `${hash('a')}  yt-dlp`,
    `${hash('b')}  yt-dlp_linux`,
    `${hash('C')} *yt-dlp_macos`,
    `${hash('d')}  yt-dlp_linux.zip`,
    '',
  ].join('\n');

  it('finds the line for the asset by exact name', () => {
    expect(parseChecksum(sums, 'yt-dlp_linux')).toBe(hash('b'));
    expect(parseChecksum(sums, 'yt-dlp')).toBe(hash('a'));
  });

  it('accepts binary-mode markers and lowercases the hash', () => {
    expect(parseChecksum(sums, 'yt-dlp_macos')).toBe(hash('c'));
  });

  it('handles CRLF and returns null for a missing asset', () => {
    expect(parseChecksum(sums.replaceAll('\n', '\r\n'), 'yt-dlp_linux')).toBe(hash('b'));
    expect(parseChecksum(sums, 'yt-dlp_linux_aarch64')).toBeNull();
    expect(parseChecksum('not a checksum file', 'yt-dlp')).toBeNull();
  });
});

describe('sha256File', () => {
  it('hashes a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mytube-sha-'));
    try {
      writeFileSync(join(dir, 'file'), 'abc');
      await expect(sha256File(join(dir, 'file'))).resolves.toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('compareVersions', () => {
  it('compares date versions numerically', () => {
    expect(compareVersions('2026.09.22', '2026.08.19')).toBe(1);
    expect(compareVersions('2026.08.19', '2026.09.22')).toBe(-1);
    expect(compareVersions('2026.09.22', '2026.09.22')).toBe(0);
    expect(compareVersions('2026.10.01', '2026.9.30')).toBe(1);
  });

  it('treats a nightly suffix as newer than the release of that day', () => {
    expect(compareVersions('2026.09.22.123456', '2026.09.22')).toBe(1);
    expect(compareVersions('2026.09.22', '2026.09.22.0')).toBe(0);
  });

  it('ignores whitespace and a v prefix', () => {
    expect(compareVersions(' v2026.09.22\n', '2026.09.22')).toBe(0);
  });
});

describe('isCheckDue', () => {
  const now = new Date('2026-09-24T12:00:00.000Z');
  const base = { now, autoUpdate: true, intervalHours: 6 };

  it('is due when there was no check yet', () => {
    expect(isCheckDue({ ...base, lastCheckedAt: null })).toBe(true);
  });

  it('is due once the interval has passed', () => {
    expect(isCheckDue({ ...base, lastCheckedAt: '2026-09-24T06:00:00.000Z' })).toBe(true);
    expect(isCheckDue({ ...base, lastCheckedAt: '2026-09-24T06:00:00.001Z' })).toBe(false);
    expect(isCheckDue({ ...base, intervalHours: 1, lastCheckedAt: '2026-09-24T10:30:00Z' })).toBe(
      true,
    );
  });

  it('is never due with auto-update off', () => {
    expect(isCheckDue({ ...base, autoUpdate: false, lastCheckedAt: null })).toBe(false);
  });

  it('treats an unreadable timestamp as no check', () => {
    expect(isCheckDue({ ...base, lastCheckedAt: 'yesterday' })).toBe(true);
  });
});

describe('releaseAssets', () => {
  const release = GithubRelease.parse({
    tag_name: '2026.09.22',
    extra: 'ignored',
    assets: [
      { name: 'yt-dlp_linux', browser_download_url: 'https://example.test/yt-dlp_linux' },
      { name: 'SHA2-256SUMS', browser_download_url: 'https://example.test/SHA2-256SUMS' },
    ],
  });

  it('picks the binary and the checksum file', () => {
    expect(releaseAssets(release, 'yt-dlp_linux')).toEqual({
      version: '2026.09.22',
      binaryUrl: 'https://example.test/yt-dlp_linux',
      checksumsUrl: 'https://example.test/SHA2-256SUMS',
    });
  });

  it('fails when the release lacks the platform asset', () => {
    expect(() => releaseAssets(release, 'yt-dlp_macos')).toThrow(/no yt-dlp_macos asset/);
  });
});
