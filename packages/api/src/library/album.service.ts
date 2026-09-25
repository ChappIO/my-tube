import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type AlbumDetail, type DownloadMissingResult, artworkPath } from '@mytube/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { albums, artists, sources, tracks } from '../database/schema.js';
import { albumUrl } from '../sync/music-sync.js';
import { SyncService } from '../sync/sync.service.js';
import { LIBRARY_TRACK_STATUSES, toTrackItem } from './music-library.service.js';

const IN_LIBRARY = sql.raw(`('${LIBRARY_TRACK_STATUSES.join("','")}')`);

/**
 * The album page: one album with its artist and its tracks in the library
 * (`GET /api/library/albums/:id`), and Download missing
 * (`POST /api/library/albums/:id/download-missing`).
 */
@Injectable()
export class AlbumService {
  private readonly logger = new Logger('Album');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly sync: SyncService,
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
      .orderBy(
        sql`coalesce(${tracks.discNumber}, 1)`,
        sql`${tracks.trackNumber} IS NULL`,
        asc(tracks.trackNumber),
        asc(tracks.id),
      )
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
   * Download missing: every track of the album in the library that is not on disk (`wanted`, or
   * `missing` set back to `wanted`) gets a download job, also when its last one failed for good
   * or was cancelled, since the user asked. Rule-skipped, unavailable and deleted tracks are left
   * alone: they are not in the library, and a track the rules skip would be removed again by the
   * next revalidation. Returns the jobs created (a track already queued adds none). 404 unknown.
   */
  downloadMissing(id: number): DownloadMissingResult {
    const album = this.db.select({ id: albums.id }).from(albums).where(eq(albums.id, id)).get();
    if (!album) throw new NotFoundException(`Album ${id} not found`);
    const candidates = this.db
      .select({ id: tracks.id, sourceId: tracks.sourceId, status: tracks.status })
      .from(tracks)
      .where(and(eq(tracks.albumId, id), inArray(tracks.status, ['wanted', 'missing'])))
      .orderBy(
        sql`coalesce(${tracks.discNumber}, 1)`,
        sql`${tracks.trackNumber} IS NULL`,
        asc(tracks.trackNumber),
        asc(tracks.id),
      )
      .all();
    if (candidates.length === 0) return { queued: 0 };

    const missing = candidates.filter((track) => track.status === 'missing').map((t) => t.id);
    if (missing.length > 0) {
      this.db
        .update(tracks)
        .set({ status: 'wanted', skipReason: null, updatedAt: new Date().toISOString() })
        .where(and(inArray(tracks.id, missing), eq(tracks.status, 'missing')))
        .run();
    }

    // Grouped by the tracks' own source: a sync-ordered playlist numbers its files by position.
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
    this.logger.log(`Download missing for album ${id}: ${queued} queued`);
    return { queued };
  }

  /** The tracks among `rows` with a download job queued or running. */
  private queuedTrackIds(rows: readonly { id: number; youtubeId: string }[]): Set<number> {
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
}

/** The lower-case extension of a file path (`m4a`), or '' without one. */
export function extensionOf(path: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(path);
  return match ? match[1]!.toLowerCase() : '';
}
