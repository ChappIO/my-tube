import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/*
 * Pure helpers of the yt-dlp binary manager: which release asset fits this machine, how to
 * read the checksum file, how versions compare, and when the next update check is due.
 */

/** Thrown when there is no standalone yt-dlp build for this OS and CPU. */
export class UnsupportedPlatformError extends Error {
  constructor(platform: string, arch: string) {
    super(
      `No yt-dlp build for ${platform}/${arch}. Supported: linux x64, linux arm64, macOS. ` +
        'Set YTDLP_PATH to a yt-dlp you installed yourself.',
    );
    this.name = 'UnsupportedPlatformError';
  }
}

/**
 * The release asset for a platform. Linux builds target glibc (the image is Debian). Windows
 * is not supported: the binary is stored without an `.exe` extension.
 */
export function assetNameFor(platform: string, arch: string): string {
  if (platform === 'linux' && arch === 'x64') return 'yt-dlp_linux';
  if (platform === 'linux' && arch === 'arm64') return 'yt-dlp_linux_aarch64';
  // The macOS build is universal (x64 and arm64).
  if (platform === 'darwin') return 'yt-dlp_macos';
  throw new UnsupportedPlatformError(platform, arch);
}

/**
 * The SHA-256 of `assetName` from a `SHA2-256SUMS` file (`<hex>  <name>` per line, the name
 * optionally prefixed with `*` for binary mode). Null when the file does not list the asset.
 */
export function parseChecksum(sums: string, assetName: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (match?.[2] === assetName) return match[1]!.toLowerCase();
  }
  return null;
}

/** SHA-256 of a file as lowercase hex. */
export async function sha256File(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}

/**
 * Compares yt-dlp versions (`2026.09.22`, nightly `2026.09.22.123456`) segment by segment as
 * numbers. Negative when `a` is older, positive when newer, 0 when equal. Non-numeric parts
 * compare as text so an odd tag never throws.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.trim().replace(/^v/i, '').split('.');
  const right = b.trim().replace(/^v/i, '').split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? '0';
    const y = right[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    const diff = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/**
 * Whether the scheduled update check should run now: only with auto-update on, and when the
 * last check is at least `intervalHours` ago (or there was none).
 */
export function isCheckDue(input: {
  now: Date;
  lastCheckedAt: string | null;
  autoUpdate: boolean;
  intervalHours: number;
}): boolean {
  if (!input.autoUpdate) return false;
  if (!input.lastCheckedAt) return true;
  const last = Date.parse(input.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  return input.now.getTime() - last >= input.intervalHours * 3_600_000;
}

/** The fields of a GitHub release the manager uses. */
export const GithubRelease = z.object({
  tag_name: z.string().min(1),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.url() })),
});
export type GithubRelease = z.infer<typeof GithubRelease>;

export interface ReleaseAssets {
  version: string;
  binaryUrl: string;
  /** `SHA2-256SUMS` when the release has one. */
  checksumsUrl: string | null;
}

/** Picks the binary and checksum file for `assetName` out of a release. */
export function releaseAssets(release: GithubRelease, assetName: string): ReleaseAssets {
  const find = (name: string) =>
    release.assets.find((asset) => asset.name === name)?.browser_download_url ?? null;
  const binaryUrl = find(assetName);
  if (!binaryUrl) {
    throw new Error(`yt-dlp release ${release.tag_name} has no ${assetName} asset`);
  }
  return { version: release.tag_name, binaryUrl, checksumsUrl: find('SHA2-256SUMS') };
}
