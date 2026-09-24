import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { YtdlpState, YtdlpStatus } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { HistoryService } from '../activity/history.service.js';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { ytdlpState } from '../database/schema.js';
import { SettingsService } from '../settings/settings.service.js';
import { GithubReleases } from './github-releases.js';
import {
  assetNameFor,
  compareVersions,
  isCheckDue,
  parseChecksum,
  releaseAssets,
  sha256File,
  type ReleaseAssets,
} from './release.js';
import type { YtdlpBinaryLocator } from './ytdlp-binary.js';
import { YtdlpRunner } from './ytdlp-runner.js';

/** How often the scheduler wakes up to decide whether an update check is due. */
export const TICK_MS = 15 * 60_000;

type StateRow = typeof ytdlpState.$inferSelect;
type Busy = 'installing' | 'updating' | null;

/**
 * Owns the yt-dlp binary: installs the latest GitHub release into `CONFIG_DIR/bin/yt-dlp` on
 * first boot, checks for updates on the settings interval and swaps new versions in. It is
 * the `YTDLP_BINARY` locator the runner asks on every spawn, so a swap needs no restart.
 *
 * `YTDLP_PATH` (dev machines, tests) points at a yt-dlp managed elsewhere: it is used as is,
 * its version is read, and install and update are refused.
 *
 * Operations (check, install, update) run one at a time through a promise chain.
 */
@Injectable()
export class YtdlpBinaryService
  implements YtdlpBinaryLocator, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger('YtdlpBinary');
  private readonly managedPath: string;
  private readonly externalPath: string | undefined;
  private readonly abort = new AbortController();
  private chain: Promise<unknown> = Promise.resolve();
  private busy: Busy = null;
  private pending = 0;

  constructor(
    config: AppConfig,
    @Inject(DATABASE) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly history: HistoryService,
    private readonly releases: GithubReleases,
  ) {
    this.managedPath = join(config.configDir, 'bin', 'yt-dlp');
    this.externalPath = process.env.YTDLP_PATH || undefined;
  }

  /** The binary the runner spawns. */
  path(): string {
    return this.externalPath ?? this.managedPath;
  }

  onApplicationBootstrap(): void {
    // Not awaited: the first install downloads ~30 MB and must not hold up `listen`.
    void this.boot();
  }

  onModuleDestroy(): void {
    this.abort.abort();
  }

  status(): YtdlpStatus {
    const row = this.readState();
    const { ytdlp } = this.settings.get();
    const installed = row.installedVersion !== null;
    return {
      installed,
      installedVersion: row.installedVersion,
      latestVersion: row.latestVersion,
      lastCheckedAt: row.lastCheckedAt,
      lastUpdatedAt: row.lastUpdatedAt,
      autoUpdate: ytdlp.autoUpdate,
      updateIntervalHours: ytdlp.updateIntervalHours,
      state: this.stateOf(row),
      error: row.lastError,
    };
  }

  /** Looks up the latest release and records it. Installs nothing. */
  check(): Promise<YtdlpStatus> {
    return this.exclusive(async () => {
      await this.lookup(null);
      return this.status();
    });
  }

  /**
   * Checks and installs the latest release when it is newer than the installed binary (or
   * nothing is installed). `force` reinstalls even when up to date.
   */
  update(options: { force?: boolean } = {}): Promise<YtdlpStatus> {
    if (this.externalPath) {
      return Promise.reject(
        new ConflictException(`yt-dlp is managed outside MyTube (YTDLP_PATH=${this.externalPath})`),
      );
    }
    return this.exclusive(async () => {
      const installed = this.readState().installedVersion;
      // Without a binary the whole operation is the install, lookup included.
      if (!installed) this.busy = 'installing';
      try {
        const assets = await this.lookup(
          installed ? 'yt-dlp update check failed' : 'yt-dlp install failed',
        );
        const newer = !installed || compareVersions(assets.version, installed) > 0;
        if (newer || options.force) await this.install(assets, installed);
      } finally {
        this.busy = null;
      }
      return this.status();
    });
  }

  /**
   * Runs every 15 minutes: retries the install while there is no binary, otherwise runs the
   * update when auto-update is on and the interval (read from settings each time) has passed.
   */
  @Interval(TICK_MS)
  async tick(): Promise<void> {
    if (this.externalPath || this.pending > 0 || this.abort.signal.aborted) return;
    const row = this.readState();
    try {
      if (row.installedVersion === null) {
        await this.update();
        return;
      }
      const { ytdlp } = this.settings.get();
      const due = isCheckDue({
        now: new Date(),
        lastCheckedAt: row.lastCheckedAt,
        autoUpdate: ytdlp.autoUpdate,
        intervalHours: ytdlp.updateIntervalHours,
      });
      if (due) await this.update();
    } catch {
      // Already logged and stored in the state by the operation.
    }
  }

  /** Verifies the binary on disk, or installs one, then runs a due update check. */
  async boot(): Promise<void> {
    const binary = this.path();
    if (existsSync(binary)) {
      try {
        const version = await this.versionOf(binary);
        this.writeState({ installedVersion: version, lastError: null });
        this.logger.log(`yt-dlp ${version} at ${binary}`);
      } catch (error) {
        if (this.aborted(error)) return;
        this.logger.warn(`yt-dlp at ${binary} does not run: ${message(error)}`);
        this.writeState({ installedVersion: null, lastError: message(error) });
      }
    } else {
      this.writeState({ installedVersion: null });
      if (this.externalPath) {
        this.writeState({ lastError: `YTDLP_PATH ${binary} does not exist` });
      }
    }
    await this.tick();
  }

  private stateOf(row: StateRow): YtdlpState {
    if (this.busy) return this.busy;
    if (row.lastError) return 'error';
    if (row.installedVersion === null) return 'not_installed';
    if (row.latestVersion && compareVersions(row.latestVersion, row.installedVersion) > 0) {
      return 'update_available';
    }
    return 'up_to_date';
  }

  /**
   * Fetches the latest release and records its version and the check time. A failure is
   * stored as the last error and, with `historyTitle`, recorded in history.
   */
  private async lookup(historyTitle: string | null): Promise<ReleaseAssets> {
    const checkedAt = new Date().toISOString();
    try {
      const assetName = assetNameFor(process.platform, process.arch);
      const release = await this.releases.latest(this.abort.signal);
      const assets = releaseAssets(release, assetName);
      this.writeState({ latestVersion: assets.version, lastCheckedAt: checkedAt, lastError: null });
      return assets;
    } catch (error) {
      if (!this.aborted(error)) {
        this.logger.warn(`yt-dlp update check failed: ${message(error)}`);
        this.writeState({ lastCheckedAt: checkedAt });
        this.fail(historyTitle, error);
      }
      throw error;
    }
  }

  /**
   * Downloads the release binary next to the target, verifies its checksum, makes it
   * executable, runs `--version` and only then renames it into place.
   */
  private async install(assets: ReleaseAssets, previous: string | null): Promise<void> {
    const signal = this.abort.signal;
    const target = this.managedPath;
    const temp = join(dirname(target), `.yt-dlp-${randomBytes(6).toString('hex')}.download`);
    this.busy = previous ? 'updating' : 'installing';
    this.logger.log(`${previous ? 'Updating' : 'Installing'} yt-dlp ${assets.version}`);
    try {
      await mkdir(dirname(target), { recursive: true });
      await this.releases.download(assets.binaryUrl, temp, signal);
      await this.verifyChecksum(assets, temp, signal);
      await chmod(temp, 0o755);
      const version = await this.versionOf(temp, signal);
      await rename(temp, target);

      const now = new Date().toISOString();
      const row = this.readState();
      const latest =
        row.latestVersion && compareVersions(row.latestVersion, version) > 0
          ? row.latestVersion
          : version;
      this.writeState({
        installedVersion: version,
        latestVersion: latest,
        lastUpdatedAt: now,
        lastError: null,
      });
      const updated = previous !== null && previous !== version;
      this.history.record({
        kind: 'system',
        title: updated ? `yt-dlp ${previous} → ${version}` : `yt-dlp ${version} installed`,
        result: updated ? 'updated' : 'installed',
      });
      this.logger.log(`yt-dlp ${version} installed at ${target}`);
    } catch (error) {
      if (!this.aborted(error)) {
        const what = previous
          ? `yt-dlp update to ${assets.version} failed`
          : `yt-dlp ${assets.version} install failed`;
        this.logger.error(`${what}: ${message(error)}`);
        this.fail(what, error);
      }
      throw error;
    } finally {
      await rm(temp, { force: true });
    }
  }

  private async verifyChecksum(
    assets: ReleaseAssets,
    file: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!assets.checksumsUrl) {
      this.logger.warn(`yt-dlp ${assets.version} has no SHA2-256SUMS; skipping verification`);
      return;
    }
    const assetName = assetNameFor(process.platform, process.arch);
    const expected = parseChecksum(
      await this.releases.text(assets.checksumsUrl, signal),
      assetName,
    );
    if (!expected) {
      this.logger.warn(`SHA2-256SUMS does not list ${assetName}; skipping verification`);
      return;
    }
    const actual = await sha256File(file);
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${assetName}: expected ${expected}, got ${actual}`);
    }
  }

  /** Stores the failure; a history row is only added when the error message changed. */
  private fail(title: string | null, error: unknown): void {
    const text = message(error);
    const previous = this.readState().lastError;
    this.writeState({ lastError: text });
    if (title && previous !== text) {
      this.history.record({ kind: 'system', title, result: 'failed', details: text });
    }
  }

  private versionOf(file: string, signal = this.abort.signal): Promise<string> {
    return new YtdlpRunner({ path: () => file }).version({ signal });
  }

  private aborted(error: unknown): boolean {
    return this.abort.signal.aborted || (error instanceof Error && error.name === 'AbortError');
  }

  /** Runs `operation` after every earlier one has settled. */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    this.pending++;
    const run = this.chain.then(operation, operation);
    this.chain = run.catch(() => undefined);
    return run.finally(() => {
      this.pending--;
    });
  }

  private readState(): StateRow {
    return (
      this.db.select().from(ytdlpState).where(eq(ytdlpState.id, 1)).get() ?? {
        id: 1,
        installedVersion: null,
        latestVersion: null,
        lastCheckedAt: null,
        lastUpdatedAt: null,
        lastError: null,
      }
    );
  }

  private writeState(patch: Partial<Omit<StateRow, 'id'>>): void {
    this.db
      .insert(ytdlpState)
      .values({ id: 1, ...patch })
      .onConflictDoUpdate({ target: ytdlpState.id, set: patch })
      .run();
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
