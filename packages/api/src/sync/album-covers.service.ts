import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { ArtworkService } from '../artwork/artwork.service.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { albums } from '../database/schema.js';
import { SettingsService } from '../settings/settings.service.js';
import { networkOptions } from '../ytdlp/network.js';
import { YtdlpRunner, YtdlpSession } from '../ytdlp/ytdlp-runner.js';
import { albumCover, albumUrl } from './music-sync.js';

/** A stale cover is listed again at most this often per album. */
export const COVER_REFRESH_COOLDOWN_MS = 6 * 3_600_000;

/**
 * Album covers against YouTube's expiring URLs. The signed cover URL of an album playlist
 * (`i9.ytimg.com/s_p/…?sqp=…`) answers 404 a few hours after it was listed, and the artwork
 * cache only downloads an image on its first request, so an album nobody looked at in time
 * lost its cover. Two measures:
 *
 * - `warm(albumId)`: the sync calls it right after recording an album, so the cover is
 *   downloaded into the cache while the URL is fresh.
 * - `refresh(albumId)`: registered with `ArtworkService.onStaleAlbum`, so a cover that answers
 *   404 is listed again (`runner.metadata(albumUrl(id), { limit: 1 })`, one at a time in the
 *   background, at most once per `COVER_REFRESH_COOLDOWN_MS` per album), the fresh URL stored
 *   on the row and downloaded at once. Albums without a playlist id (grouped from uploads)
 *   have nothing to list again. Until then the album shows its first track's sidecar thumbnail.
 */
@Injectable()
export class AlbumCoverService {
  private readonly logger = new Logger('AlbumCovers');
  private readonly queued = new Set<number>();
  private readonly tried = new Map<number, number>();
  private chain: Promise<void> = Promise.resolve();
  /** One session for the background refreshes, so a cookies decision is made once. */
  private readonly session = new YtdlpSession();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly artwork: ArtworkService,
  ) {
    this.artwork.onStaleAlbum((albumId) => this.refresh(albumId));
  }

  /** Downloads the album's cover into the artwork cache now (in the background). */
  warm(albumId: number): void {
    void this.artwork.warm('album', albumId);
  }

  /**
   * Lists the album again for a fresh cover URL and caches the cover, in the background.
   * De-duplicated while queued and rate-limited per album; resolves when the queue drained.
   */
  refresh(albumId: number, now = Date.now()): Promise<void> {
    const tried = this.tried.get(albumId);
    if (
      this.queued.has(albumId) ||
      (tried !== undefined && now - tried < COVER_REFRESH_COOLDOWN_MS)
    ) {
      return this.chain;
    }
    this.queued.add(albumId);
    this.tried.set(albumId, now);
    this.chain = this.chain
      .then(() => this.relist(albumId))
      .catch((error: unknown) => {
        this.logger.warn(`Could not refresh the cover of album ${albumId}: ${String(error)}`);
      })
      .finally(() => this.queued.delete(albumId));
    return this.chain;
  }

  /** Resolves once every queued refresh has run (tests). */
  idle(): Promise<void> {
    return this.chain;
  }

  private async relist(albumId: number): Promise<void> {
    const album = this.db
      .select({ youtubeId: albums.youtubeId, title: albums.title, coverUrl: albums.coverUrl })
      .from(albums)
      .where(eq(albums.id, albumId))
      .get();
    if (!album?.youtubeId) return;
    const metadata = await this.runner.metadata(albumUrl(album.youtubeId), {
      limit: 1,
      network: networkOptions(this.settings.get().network),
      session: this.session,
    });
    const coverUrl = albumCover(metadata);
    if (!coverUrl || coverUrl === album.coverUrl) {
      this.logger.warn(`Album ${albumId} (${album.title}) lists no new cover`);
      return;
    }
    this.db
      .update(albums)
      .set({ coverUrl, updatedAt: new Date().toISOString() })
      .where(eq(albums.id, albumId))
      .run();
    const warmed = await this.artwork.warm('album', albumId);
    this.logger.log(
      `Refreshed the cover of album ${albumId} (${album.title})${warmed ? '' : ', not downloaded'}`,
    );
  }
}
