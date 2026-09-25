import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type AlbumDetail, type DownloadMissingResult, artworkPath } from '@mytube/shared';
import { type SQL, and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { albums, artists, sources, tracks } from '../database/schema.js';
import { albumUrl } from '../sync/music-sync.js';
import { RevalidationService } from '../sync/revalidation.service.js';
import { SyncService } from '../sync/sync.service.js';
import { LIBRARY_TRACK_STATUSES, toTrackItem } from './music-library.service.js';

const IN_LIBRARY = sql.raw(`('${LIBRARY_TRACK_STATUSES.join("','")}')`);

/** Album order: disc, then track number (unnumbered last), then id. */
const ALBUM_ORDER = [
  sql`coalesce(${tracks.discNumber}, 1)`,
  sql`${tracks.trackNumber} IS NULL`,
  asc(tracks.trackNumber),
  asc(tracks.id),
];

/**
 * The album page: one album with its artist and its tracks in the library
 * (`GET /api/library/albums/:id`), Download missing
 * (`POST /api/library/albums/:id/download-missing`), and the pin: Download of a whole release
 * (`POST /api/library/albums/:id/download`, the artist page's "Not in library") and Unpin
 * (`DELETE /api/library/albums/:id/pin`).
 */
@Injectable()
export class AlbumService {
  private readonly logger = new Logger('Album');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sync: SyncService,
    private readonly revalidation: RevalidationService,
  ) {}

  /**
   * The album, its artist (with the Artists tab's counts and its source's bell), its tracks in
   * the library in album order (disc, track number, id) and the header totals. 404 unknown.
   */
  getAlbum(id: number): AlbumDetail {
    const album = this.db.select().from(albums).where(eq(albums.id, id)).get();
    if (!album) throw new NotFoundException(`Album ${id} not found`);
    const artist = this.db.select().from(artists).where(eq(artists.id, album.artistId)).get();
    if (!artist) throw new NotFoundException(`Album ${id} has no artist`);

    const rows = this.db
      .select({ track: tracks, artist: artists })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .where(and(eq(tracks.albumId, id), inArray(tracks.status, [...LIBRARY_TRACK_STATUSES])))
      .orderBy(...ALBUM_ORDER)
      .all();
    const items = rows.map((row) => toTrackItem(row.track, row.artist, album));

    const onDisk = items.filter((track) => track.status === 'on_disk' && track.filePath !== null);
    const extensions = new Set(onDisk.map((track) => extensionOf(track.filePath!)));
    const queued = this.queuedTrackIds(rows.map((row) => row.track));

    const counts = this.db.get<{ albumCount: number; trackCount: number }>(sql`
      SELECT
        (SELECT count(*) FROM tracks t WHERE t.artist_id = ${artist.id} AND t.status IN ${IN_LIBRARY})
          AS trackCount,
        (SELECT count(*) FROM albums al WHERE al.artist_id = ${artist.id} AND EXISTS (
          SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.status IN ${IN_LIBRARY}))
          AS albumCount
    `);
    const source =
      artist.sourceId === null
        ? undefined
        : this.db
            .select({ subscribed: sources.subscribed })
            .from(sources)
            .where(eq(sources.id, artist.sourceId))
            .get();

    return {
      album: {
        id: album.id,
        title: album.title,
        year: album.year,
        coverUrl: artworkPath('album', album.id),
        youtubeId: album.youtubeId,
        youtubeUrl: album.youtubeId === null ? null : albumUrl(album.youtubeId),
        pinned: album.pinned,
      },
      artist: {
        id: artist.id,
        name: artist.name,
        avatarUrl: artist.avatarUrl === null ? null : artworkPath('artist', artist.id),
        sourceId: artist.sourceId,
        subscribed: source?.subscribed ?? false,
        albumCount: counts.albumCount,
        trackCount: counts.trackCount,
      },
      tracks: items,
      trackCount: items.length,
      onDiskCount: onDisk.length,
      wantedCount: items.filter(
        (track) => track.status === 'wanted' || track.status === 'downloading',
      ).length,
      missingCount: items.length - onDisk.length,
      queuedCount: items.filter((track) => track.status !== 'on_disk' && queued.has(track.id))
        .length,
      totalDurationSeconds: items.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0),
      sizeBytes: onDisk.reduce((sum, track) => sum + (track.fileSizeBytes ?? 0), 0),
      container: extensions.size === 1 ? [...extensions][0]! : null,
    };
  }

  /**
   * Download missing: every track of the album in the library that is not on disk gets a
   * download job (`queueNotOnDisk`). Rule-skipped, unavailable and deleted tracks are left
   * alone: they are not in the library, and a track the rules skip would be removed again by the
   * next revalidation. Returns the jobs created (a track already queued adds none). 404 unknown.
   */
  downloadMissing(id: number): DownloadMissingResult {
    this.requireAlbum(id);
    const queued = this.queueNotOnDisk(eq(tracks.albumId, id));
    this.logger.log(`Download missing for album ${id}: ${queued} queued`);
    return { queued };
  }

  /**
   * Download a whole release (the artist page's "Not in library"): pins the album, so its tracks
   * count as matching whatever the source's rules say (in the sync and in revalidation), turns
   * the tracks the rules skipped or the user deleted into `wanted`, and queues every track not
   * on disk as Download missing does. `unavailable` tracks stay skipped: YouTube refuses them.
   * Returns the jobs created. 404 unknown.
   */
  download(id: number): DownloadMissingResult {
    this.requireAlbum(id);
    const stamp = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.update(albums).set({ pinned: true, updatedAt: stamp }).where(eq(albums.id, id)).run();
      tx.update(tracks)
        .set({ status: 'wanted', skipReason: null, updatedAt: stamp })
        .where(
          and(
            eq(tracks.albumId, id),
            eq(tracks.status, 'skipped'),
            inArray(tracks.skipReason, ['no_match', 'no_longer_matches', 'deleted_by_user']),
          ),
        )
        .run();
    });
    const queued = this.queueNotOnDisk(eq(tracks.albumId, id));
    this.logger.log(`Pinned album ${id}: ${queued} queued`);
    return { queued };
  }

  /**
   * Unpin: the album's tracks follow their sources' rules again. A revalidation of each source
   * that owns one of its tracks is queued at once, so the files those rules do not match are
   * removed now rather than at the next scheduled revalidation. 404 unknown.
   */
  unpin(id: number): void {
    this.requireAlbum(id);
    this.db
      .update(albums)
      .set({ pinned: false, updatedAt: new Date().toISOString() })
      .where(eq(albums.id, id))
      .run();
    const owners = this.db
      .selectDistinct({ sourceId: tracks.sourceId })
      .from(tracks)
      .where(and(eq(tracks.albumId, id), isNotNull(tracks.sourceId)))
      .all();
    for (const { sourceId } of owners) this.revalidation.enqueue(sourceId!);
    this.logger.log(`Unpinned album ${id}: ${owners.length} revalidation(s) queued`);
  }

  /**
   * Queues a download for every track in `scope` (a condition on `tracks`: one album's, one
   * artist's) in the library that is not on disk (`wanted`, or `missing` set back to `wanted`,
   * since the track runner leaves `missing` alone), also when its last one failed for good or
   * was cancelled: the user asked. Grouped by the tracks' own source (null for a removed one),
   * since a sync-ordered playlist numbers its files by position. Returns the jobs created (a
   * track already queued adds none).
   */
  queueNotOnDisk(scope: SQL | undefined): number {
    const candidates = this.db
      .select({ id: tracks.id, sourceId: tracks.sourceId, status: tracks.status })
      .from(tracks)
      .where(and(scope, inArray(tracks.status, ['wanted', 'missing'])))
      .orderBy(...ALBUM_ORDER)
      .all();
    if (candidates.length === 0) return 0;

    const missing = candidates.filter((track) => track.status === 'missing').map((t) => t.id);
    if (missing.length > 0) {
      this.db
        .update(tracks)
        .set({ status: 'wanted', skipReason: null, updatedAt: new Date().toISOString() })
        .where(and(inArray(tracks.id, missing), eq(tracks.status, 'missing')))
        .run();
    }

    const bySource = new Map<number | null, number[]>();
    for (const track of candidates) {
      bySource.set(track.sourceId, [...(bySource.get(track.sourceId) ?? []), track.id]);
    }
    let queued = 0;
    for (const [sourceId, ids] of bySource) {
      const source =
        sourceId === null
          ? null
          : (this.db.select().from(sources).where(eq(sources.id, sourceId)).get() ?? null);
      queued += this.sync.music.enqueueDownloads(source, ids, { explicit: true });
    }
    return queued;
  }

  /** The tracks among `rows` with a download job queued or running. */
  queuedTrackIds(rows: readonly { id: number; youtubeId: string }[]): Set<number> {
    if (rows.length === 0) return new Set();
    const keys = rows.map((row) => `track:${row.youtubeId}`);
    const active = this.db.all<{ key: string }>(sql`
      SELECT dedupe_key AS key FROM jobs
      WHERE type = 'download' AND status IN ('queued', 'running')
        AND dedupe_key IN (${sql.join(
          keys.map((key) => sql`${key}`),
          sql`, `,
        )})
    `);
    const activeKeys = new Set(active.map((row) => row.key));
    return new Set(rows.filter((row) => activeKeys.has(`track:${row.youtubeId}`)).map((r) => r.id));
  }

  private requireAlbum(id: number): void {
    const album = this.db.select({ id: albums.id }).from(albums).where(eq(albums.id, id)).get();
    if (!album) throw new NotFoundException(`Album ${id} not found`);
  }
}

/** The lower-case extension of a file path (`m4a`), or '' without one. */
export function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1]!.toLowerCase() : '';
}
