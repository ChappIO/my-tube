import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ArtworkKind } from '@mytube/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { artists, artworkCache, channels, playlists, videos } from '../database/schema.js';
import { OutsideLibraryError, libraryPath } from '../files/media-files.js';

/** Cached artwork is pruned to this many bytes, least recently served first. */
export const ARTWORK_CACHE_MAX_BYTES = 500 * 1000 * 1000;
/** Remote images larger than this are refused (a thumbnail is a few hundred KB). */
export const ARTWORK_MAX_BYTES = 10 * 1000 * 1000;
export const ARTWORK_FETCH_TIMEOUT_MS = 10_000;
export const ARTWORK_MAX_CONCURRENT = 4;
/** A failed fetch is not retried for this long; requests in between are answered at once. */
export const ARTWORK_NEGATIVE_TTL_MS = 30_000;
/** `used_at` is written at most this often per image, so serving stays read-only. */
const TOUCH_INTERVAL_MS = 3_600_000;

/** Sidecar thumbnails yt-dlp writes next to a video, in the order they are preferred. */
const SIDECAR_EXTENSIONS = ['jpg', 'webp', 'png'] as const;

const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** The remote host is rate-limiting or failing (429, 5xx, timeout): try again shortly. */
export class ArtworkUnavailableError extends Error {
  override readonly name = 'ArtworkUnavailableError';
}

/** A file to send for an artwork request. */
export interface ArtworkFile {
  /** Absolute path. */
  path: string;
  /** Explicit content type (cached files); sidecars get theirs from the extension. */
  contentType: string | null;
}

interface ArtworkOrigin {
  /** The remote image stored on the row. */
  remoteUrl: string | null;
  /** A thumbnail next to the video file, preferred over the remote one. */
  sidecar: string | null;
}

/**
 * The artwork cache behind `GET /api/artwork/:kind/:id`. The web never loads Google's image
 * hosts itself; every avatar and thumbnail goes through here and is downloaded once.
 *
 * - A video on disk is served from its sidecar thumbnail (`<name>.jpg`) when there is one.
 * - Otherwise the remote URL on the row (`avatar_url`, `thumbnail_url`) is downloaded into
 *   `CONFIG_DIR/cache/artwork/<kind>/<id>.<ext>` with a MyTube User-Agent, a 10 s timeout and
 *   at most 4 fetches at once (concurrent requests for the same image share one fetch), and
 *   recorded in `artwork_cache`. A changed remote URL is fetched again.
 * - 429, 5xx, timeouts and network errors throw `ArtworkUnavailableError` (the controller
 *   answers 503 with `Retry-After: 5`); other failures are a 404. Either is remembered in
 *   memory for 30 s only, so a burst of tiles does not hammer a host that said no.
 * - After each download the cache is pruned to 500 MB, least recently served first.
 */
@Injectable()
export class ArtworkService {
  private readonly logger = new Logger('Artwork');
  private readonly negative = new Map<string, { until: number; unavailable: boolean }>();
  private readonly inflight = new Map<string, Promise<ArtworkFile>>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  /** The cache folder, `CONFIG_DIR/cache/artwork`. */
  get cacheDir(): string {
    return join(this.config.configDir, 'cache', 'artwork');
  }

  /**
   * The file to serve for one row's artwork. Throws 404 when the row does not exist or has no
   * image, and `ArtworkUnavailableError` when the remote host cannot be reached right now.
   */
  async locate(kind: ArtworkKind, id: number): Promise<ArtworkFile> {
    const origin = this.origin(kind, id);
    if (origin.sidecar) return { path: origin.sidecar, contentType: null };
    const remoteUrl = origin.remoteUrl;
    if (!remoteUrl) throw new NotFoundException(`No artwork for ${kind} ${id}`);

    const key = `${kind}/${id}`;
    const cached = this.cached(key, remoteUrl);
    if (cached) return cached;

    const failed = this.negative.get(key);
    if (failed && failed.until > Date.now()) throw artworkError(failed.unavailable, key);
    this.negative.delete(key);

    let pending = this.inflight.get(key);
    if (!pending) {
      pending = this.fetchAndStore(key, remoteUrl).finally(() => this.inflight.delete(key));
      this.inflight.set(key, pending);
    }
    return pending;
  }

  /** Removes the least recently served files until the cache fits in `maxBytes`. */
  prune(maxBytes = ARTWORK_CACHE_MAX_BYTES): number {
    const total =
      this.db
        .select({ total: sql<number>`coalesce(sum(${artworkCache.size}), 0)` })
        .from(artworkCache)
        .get()?.total ?? 0;
    if (total <= maxBytes) return 0;
    let excess = total - maxBytes;
    let removed = 0;
    const rows = this.db
      .select()
      .from(artworkCache)
      .orderBy(asc(artworkCache.usedAt), asc(artworkCache.key))
      .all();
    for (const row of rows) {
      if (excess <= 0) break;
      rmSync(join(this.cacheDir, row.file), { force: true });
      this.db.delete(artworkCache).where(eq(artworkCache.key, row.key)).run();
      excess -= row.size;
      removed++;
    }
    return removed;
  }

  /** Where a row's artwork comes from. 404 for an unknown row. */
  private origin(kind: ArtworkKind, id: number): ArtworkOrigin {
    const missing = () => new NotFoundException(`Unknown ${kind} ${id}`);
    if (kind === 'video') {
      const row = this.db
        .select({
          thumbnailUrl: videos.thumbnailUrl,
          status: videos.status,
          filePath: videos.filePath,
        })
        .from(videos)
        .where(eq(videos.id, id))
        .get();
      if (!row) throw missing();
      return {
        remoteUrl: row.thumbnailUrl,
        sidecar: row.status === 'on_disk' && row.filePath ? this.sidecar(row.filePath) : null,
      };
    }
    const table = kind === 'channel' ? channels : kind === 'artist' ? artists : null;
    if (table) {
      const row = this.db
        .select({ url: table.avatarUrl })
        .from(table)
        .where(eq(table.id, id))
        .get();
      if (!row) throw missing();
      return { remoteUrl: row.url, sidecar: null };
    }
    const row = this.db
      .select({ url: playlists.thumbnailUrl })
      .from(playlists)
      .where(eq(playlists.id, id))
      .get();
    if (!row) throw missing();
    return { remoteUrl: row.url, sidecar: null };
  }

  /** The sidecar thumbnail next to a video file (`<name>.jpg|webp|png`), if one exists. */
  private sidecar(filePath: string): string | null {
    try {
      const media = libraryPath(this.config.videoDir, filePath);
      const stem = join(dirname(media), basename(media, extname(media)));
      for (const extension of SIDECAR_EXTENSIONS) {
        const candidate = `${stem}.${extension}`;
        if (existsSync(candidate)) return candidate;
      }
    } catch (error) {
      if (!(error instanceof OutsideLibraryError)) throw error;
    }
    return null;
  }

  /** The cached file for `key` when it came from `remoteUrl` and is still there. */
  private cached(key: string, remoteUrl: string): ArtworkFile | null {
    const row = this.db.select().from(artworkCache).where(eq(artworkCache.key, key)).get();
    if (!row || row.sourceUrl !== remoteUrl) return null;
    const path = join(this.cacheDir, row.file);
    if (!existsSync(path)) return null;
    const now = Date.now();
    if (now - Date.parse(row.usedAt) > TOUCH_INTERVAL_MS) {
      this.db
        .update(artworkCache)
        .set({ usedAt: new Date(now).toISOString() })
        .where(eq(artworkCache.key, key))
        .run();
    }
    return { path, contentType: row.contentType };
  }

  private async fetchAndStore(key: string, remoteUrl: string): Promise<ArtworkFile> {
    await this.acquire();
    try {
      let response: Response;
      try {
        response = await fetch(remoteUrl, {
          headers: {
            'User-Agent': `MyTube/${this.config.version} (self-hosted media library)`,
            Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
          },
          signal: AbortSignal.timeout(ARTWORK_FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        this.logger.warn(`Could not fetch ${key}: ${String(error)}`);
        throw this.fail(key, true);
      }
      if (!response.ok) {
        this.logger.warn(`Fetching ${key} answered ${response.status}`);
        throw this.fail(key, response.status === 429 || response.status >= 500);
      }
      const contentType = (response.headers.get('content-type') ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      const extension = EXTENSION_BY_TYPE[contentType];
      if (!extension) {
        this.logger.warn(`Fetching ${key} gave ${contentType || 'no content type'}, not an image`);
        throw this.fail(key, false);
      }
      let body: Buffer;
      try {
        body = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        this.logger.warn(`Could not read ${key}: ${String(error)}`);
        throw this.fail(key, true);
      }
      if (body.length === 0 || body.length > ARTWORK_MAX_BYTES) throw this.fail(key, false);
      return this.store(key, remoteUrl, contentType, extension, body, response.headers.get('etag'));
    } finally {
      this.release();
    }
  }

  private store(
    key: string,
    remoteUrl: string,
    contentType: string,
    extension: string,
    body: Buffer,
    etag: string | null,
  ): ArtworkFile {
    const file = `${key}.${extension}`;
    const path = join(this.cacheDir, file);
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temp, body);
    renameSync(temp, path);
    const previous = this.db
      .select({ file: artworkCache.file })
      .from(artworkCache)
      .where(eq(artworkCache.key, key))
      .get();
    if (previous && previous.file !== file) {
      rmSync(join(this.cacheDir, previous.file), { force: true });
    }
    const now = new Date().toISOString();
    const row = {
      sourceUrl: remoteUrl,
      file,
      contentType,
      etag,
      size: body.length,
      fetchedAt: now,
      usedAt: now,
    };
    this.db
      .insert(artworkCache)
      .values({ key, ...row })
      .onConflictDoUpdate({ target: artworkCache.key, set: row })
      .run();
    this.prune();
    return { path, contentType };
  }

  /** Remembers a failure for 30 s and returns the error to throw. */
  private fail(key: string, unavailable: boolean): Error {
    this.negative.set(key, { until: Date.now() + ARTWORK_NEGATIVE_TTL_MS, unavailable });
    return artworkError(unavailable, key);
  }

  private async acquire(): Promise<void> {
    if (this.active < ARTWORK_MAX_CONCURRENT) {
      this.active++;
      return;
    }
    // The slot is handed over by `release`, so `active` stays counted.
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }
}

function artworkError(unavailable: boolean, key: string): Error {
  return unavailable
    ? new ArtworkUnavailableError(`Artwork ${key} is temporarily unavailable`)
    : new NotFoundException(`No artwork for ${key}`);
}
