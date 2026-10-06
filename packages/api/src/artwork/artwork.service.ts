import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ArtworkKind } from '@mytube/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  albums,
  artists,
  artworkCache,
  channels,
  playlists,
  tracks,
  videos,
} from '../database/schema.js';
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
/** Query parameters that only sign or expire a YouTube image URL, not choose the image. */
const SIGNATURE_PARAMS = ['sqp', 'rs'];
/** Tracks of an album looked at for a sidecar fallback, in album order. */
const SIDECAR_CANDIDATES = 5;

/** Sidecar thumbnails yt-dlp writes next to a video or track, in the order they are preferred. */
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
  /**
   * A thumbnail next to the video or track file, preferred over the remote one. For an album:
   * the sidecar of its first track on disk, the fallback when the cover cannot be fetched.
   */
  sidecar: string | null;
}

/** Told when an album's stored cover URL answers 404 (YouTube's signed cover URLs expire). */
export type StaleAlbumListener = (albumId: number) => void;

/**
 * Whether two remote URLs name the same image: equal once the signature parameters (`sqp`,
 * `rs`) are dropped. A re-sync stores a freshly signed URL for the same cover; the cached file
 * stays valid for it.
 */
export function sameImage(a: string, b: string): boolean {
  return a === b || unsigned(a) === unsigned(b);
}

function unsigned(url: string): string {
  try {
    const parsed = new URL(url);
    for (const name of SIGNATURE_PARAMS) parsed.searchParams.delete(name);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * The artwork cache behind `GET /api/artwork/:kind/:id`. The web never loads Google's image
 * hosts itself; every avatar and thumbnail goes through here and is downloaded once.
 *
 * - A video or track on disk is served from its sidecar thumbnail (`<name>.jpg`) when there
 *   is one. An album is its cover (`albums.cover_url`), else its first track's thumbnail; when
 *   that cannot be fetched, the sidecar of its first track on disk stands in.
 * - Otherwise the remote URL on the row (`avatar_url`, `thumbnail_url`) is downloaded into
 *   `CONFIG_DIR/cache/artwork/<kind>/<id>.<ext>` with a MyTube User-Agent, a 10 s timeout and
 *   at most 4 fetches at once (concurrent requests for the same image share one fetch), and
 *   recorded in `artwork_cache`. A changed remote URL is fetched again, unless only its
 *   signature changed (`sameImage`).
 * - YouTube's signed album cover URLs (`i9.ytimg.com/s_p/…?sqp=…`) expire within hours. A
 *   cover that answers 404 is reported to the `StaleAlbumListener` (the sync's
 *   `AlbumCoverService`, which lists the album again for a fresh URL); `warm` lets the sync
 *   download a cover right after it learns the URL.
 * - 429, 5xx, timeouts and network errors throw `ArtworkUnavailableError` (the controller
 *   answers 503 with `Retry-After: 5`); other failures are a 404. Either is remembered in
 *   memory for 30 s only, so a burst of tiles does not hammer a host that said no.
 * - After each download the cache is pruned to 500 MB, least recently served first.
 */
@Injectable()
export class ArtworkService {
  private readonly logger = new Logger('Artwork');
  private readonly negative = new Map<
    string,
    { url: string; until: number; unavailable: boolean }
  >();
  private readonly inflight = new Map<string, Promise<ArtworkFile>>();
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private staleAlbum: StaleAlbumListener | null = null;

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
    const sidecar = origin.sidecar ? { path: origin.sidecar, contentType: null } : null;
    const remoteUrl = origin.remoteUrl;
    if (kind !== 'album') {
      if (sidecar) return sidecar;
      if (!remoteUrl) throw new NotFoundException(`No artwork for ${kind} ${id}`);
      return this.remote(`${kind}/${id}`, remoteUrl);
    }
    // An album: the cover first, the sidecar of its first track on disk when that fails.
    if (!remoteUrl) {
      if (sidecar) return sidecar;
      throw new NotFoundException(`No artwork for ${kind} ${id}`);
    }
    try {
      return await this.remote(`${kind}/${id}`, remoteUrl);
    } catch (error) {
      if (error instanceof NotFoundException) this.staleAlbum?.(id);
      if (sidecar) return sidecar;
      throw error;
    }
  }

  /** Called when an album's cover URL answers 404; one listener (the sync's cover refresh). */
  onStaleAlbum(listener: StaleAlbumListener | null): void {
    this.staleAlbum = listener;
  }

  /**
   * Downloads a row's artwork into the cache now instead of on its first request. Resolves
   * false when it could not be (already logged); never throws.
   */
  async warm(kind: ArtworkKind, id: number): Promise<boolean> {
    try {
      await this.locate(kind, id);
      return true;
    } catch {
      return false;
    }
  }

  /** The cached file for `key` from `remoteUrl`, else a download of it. */
  private async remote(key: string, remoteUrl: string): Promise<ArtworkFile> {
    const cached = this.cached(key, remoteUrl);
    if (cached) return cached;

    // A remembered failure is for one URL: a refreshed cover is tried at once.
    const failed = this.negative.get(key);
    if (failed && failed.url === remoteUrl && failed.until > Date.now()) {
      throw artworkError(failed.unavailable, key);
    }
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
        sidecar:
          row.status === 'on_disk' && row.filePath
            ? this.sidecar(this.config.videoDir, row.filePath)
            : null,
      };
    }
    if (kind === 'track') {
      const row = this.db
        .select({
          thumbnailUrl: tracks.thumbnailUrl,
          status: tracks.status,
          filePath: tracks.filePath,
        })
        .from(tracks)
        .where(eq(tracks.id, id))
        .get();
      if (!row) throw missing();
      return {
        remoteUrl: row.thumbnailUrl,
        sidecar:
          row.status === 'on_disk' && row.filePath
            ? this.sidecar(this.config.musicDir, row.filePath)
            : null,
      };
    }
    if (kind === 'album') {
      const row = this.db
        .select({ coverUrl: albums.coverUrl })
        .from(albums)
        .where(eq(albums.id, id))
        .get();
      if (!row) throw missing();
      const sidecar = this.albumSidecar(id);
      if (row.coverUrl) return { remoteUrl: row.coverUrl, sidecar };
      // An album known only from track metadata has no cover of its own: its first track's.
      const first = this.db
        .select({ thumbnailUrl: tracks.thumbnailUrl })
        .from(tracks)
        .where(eq(tracks.albumId, id))
        .orderBy(sql`${tracks.trackNumber} IS NULL`, asc(tracks.trackNumber), asc(tracks.id))
        .limit(1)
        .get();
      return { remoteUrl: first?.thumbnailUrl ?? null, sidecar };
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

  /** The sidecar thumbnail of an album's first track on disk that has one, in album order. */
  private albumSidecar(albumId: number): string | null {
    const rows = this.db
      .select({ filePath: tracks.filePath })
      .from(tracks)
      .where(
        and(eq(tracks.albumId, albumId), eq(tracks.status, 'on_disk'), isNotNull(tracks.filePath)),
      )
      .orderBy(
        sql`${tracks.discNumber} IS NULL`,
        asc(tracks.discNumber),
        sql`${tracks.trackNumber} IS NULL`,
        asc(tracks.trackNumber),
        asc(tracks.id),
      )
      .limit(SIDECAR_CANDIDATES)
      .all();
    for (const row of rows) {
      const sidecar = this.sidecar(this.config.musicDir, row.filePath!);
      if (sidecar) return sidecar;
    }
    return null;
  }

  /** The sidecar thumbnail next to a media file (`<name>.jpg|webp|png`), if one exists. */
  private sidecar(root: string, filePath: string): string | null {
    try {
      const media = libraryPath(root, filePath);
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
    if (!row || !sameImage(row.sourceUrl, remoteUrl)) return null;
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
      const fail = (unavailable: boolean) => this.fail(key, remoteUrl, unavailable);
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
        throw fail(true);
      }
      if (!response.ok) {
        this.logger.warn(`Fetching ${key} answered ${response.status}`);
        throw fail(response.status === 429 || response.status >= 500);
      }
      const contentType = (response.headers.get('content-type') ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      const extension = EXTENSION_BY_TYPE[contentType];
      if (!extension) {
        this.logger.warn(`Fetching ${key} gave ${contentType || 'no content type'}, not an image`);
        throw fail(false);
      }
      let body: Buffer;
      try {
        body = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        this.logger.warn(`Could not read ${key}: ${String(error)}`);
        throw fail(true);
      }
      if (body.length === 0 || body.length > ARTWORK_MAX_BYTES) throw fail(false);
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

  /** Remembers a failure of `url` for 30 s and returns the error to throw. */
  private fail(key: string, url: string, unavailable: boolean): Error {
    this.negative.set(key, { url, until: Date.now() + ARTWORK_NEGATIVE_TTL_MS, unavailable });
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
