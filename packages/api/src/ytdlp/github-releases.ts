import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { GithubRelease } from './release.js';

export const LATEST_RELEASE_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

const API_TIMEOUT_MS = 30_000;
/** The binaries are 20 to 40 MB. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * Talks to GitHub for the binary manager: the latest release, the checksum file and the
 * binary itself. Uses the global `fetch` at call time, so tests stub it with `vi.stubGlobal`.
 * `GITHUB_TOKEN`, when set, raises the API rate limit; it is only sent to api.github.com.
 */
@Injectable()
export class GithubReleases {
  async latest(signal?: AbortSignal): Promise<GithubRelease> {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'MyTube',
      'x-github-api-version': '2022-11-28',
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await this.fetch(LATEST_RELEASE_URL, { headers }, API_TIMEOUT_MS, signal);
    return GithubRelease.parse(await response.json());
  }

  async text(url: string, signal?: AbortSignal): Promise<string> {
    const response = await this.fetch(
      url,
      { headers: { 'user-agent': 'MyTube' } },
      API_TIMEOUT_MS,
      signal,
    );
    return response.text();
  }

  /** Streams `url` into `file` (created or truncated). */
  async download(url: string, file: string, signal?: AbortSignal): Promise<void> {
    const response = await this.fetch(
      url,
      { headers: { 'user-agent': 'MyTube' } },
      DOWNLOAD_TIMEOUT_MS,
      signal,
    );
    if (!response.body) throw new Error(`Empty response from ${url}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file, { mode: 0o600 }));
  }

  private async fetch(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      const detail = response.status === 403 ? ' (rate limited? set GITHUB_TOKEN)' : '';
      throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}${detail}`);
    }
    return response;
  }
}
