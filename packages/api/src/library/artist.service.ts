import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type ArtistAlbum,
  type ArtistDetail,
  type DownloadMissingResult,
  type OtherRelease,
  artworkPath,
} from '@mytube/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { artists, sources, tracks } from '../database/schema.js';
import { albumUrl } from '../sync/music-sync.js';
import { AlbumService } from './album.service.js';
import { LIBRARY_TRACK_STATUSES } from './music-library.service.js';

const IN_LIBRARY = sql.raw(`('${LIBRARY_TRACK_STATUSES.join("','")}')`);

/** An artist on YouTube Music. */
export function artistUrl(channelId: string): string {
  return `https://music.youtube.com/channel/${channelId}`;
}

/**
 * The artist page (`GET /api/library/artists/:id`) and its Download missing
 * (`POST /api/library/artists/:id/download-missing`).
 *
 * The music sync stores every release of an artist source's Releases tab as an album with its
 * tracks, the ones the rules skip as `skipped` / `no_match`. So the page splits the artist's
 * albums in two: **in your library** (a track in the library, or pinned) and **not in library**
 * (tracks stored, none in the library, and at least one that could be downloaded: not
 * `unavailable`). An album row without tracks (a single whose one track is filed under its album)
 * is in neither.
 */
@Injectable()
export class ArtistService {
  private readonly logger = new Logger('Artist');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly albumService: AlbumService,
  ) {}

  /** The artist page. 404 for an unknown artist. */
  getArtist(id: number): ArtistDetail {
    const artist = this.db.select().from(artists).where(eq(artists.id, id)).get();
    if (!artist) throw new NotFoundException(`Artist ${id} not found`);
    const source =
      artist.sourceId === null
        ? undefined
        : this.db.select().from(sources).where(eq(sources.id, artist.sourceId)).get();

    const inLibrary = this.inLibrary(id);
    const notInLibrary = this.notInLibrary(id);

    // The artist's tracks in the library (as on the Artists tab), and the ones not on disk.
    const rows = this.db
      .select({ id: tracks.id, youtubeId: tracks.youtubeId, status: tracks.status })
      .from(tracks)
      .where(and(eq(tracks.artistId, id), inArray(tracks.status, [...LIBRARY_TRACK_STATUSES])))
      .all();
    const notOnDisk = rows.filter((track) => track.status !== 'on_disk');
    const queued = this.albumService.queuedTrackIds(notOnDisk);

    return {
      artist: {
        id: artist.id,
        name: artist.name,
        avatarUrl: artist.avatarUrl === null ? null : artworkPath('artist', artist.id),
        youtubeUrl: artist.youtubeId === null ? null : artistUrl(artist.youtubeId),
        sourceId: source?.id ?? null,
        subscribed: source?.subscribed ?? false,
        since: source?.createdAt ?? null,
        lastCheckedAt: source?.lastCheckedAt ?? null,
        matcher: source?.matcher ?? null,
      },
      albumCount: inLibrary.length,
      onDiskTracks: rows.length - notOnDisk.length,
      missingTracks: notOnDisk.length,
      wantedTracks: notOnDisk.filter(
        (track) => track.status === 'wanted' || track.status === 'downloading',
      ).length,
      queuedTracks: queued.size,
      inLibrary,
      notInLibrary,
    };
  }

  /**
   * Download missing on the artist page: a download job for each of the artist's tracks in the
   * library that is not on disk, as the album page's Download missing does per album (never a
   * track the rules skip). 404 for an unknown artist.
   */
  downloadMissing(id: number): DownloadMissingResult {
    const artist = this.db.select({ id: artists.id }).from(artists).where(eq(artists.id, id)).get();
    if (!artist) throw new NotFoundException(`Artist ${id} not found`);
    const queued = this.albumService.queueNotOnDisk(eq(tracks.artistId, id));
    this.logger.log(`Download missing for artist ${id}: ${queued} queued`);
    return { queued };
  }

  /** Albums with a track in the library or pinned, newest year first, then title. */
  private inLibrary(artistId: number): ArtistAlbum[] {
    const rows = this.db.all<{
      id: number;
      title: string;
      year: number | null;
      pinned: number;
      artistName: string;
      trackCount: number;
      onDiskCount: number;
      wantedCount: number;
      firstTrackId: number | null;
    }>(sql`
      SELECT al.id, al.title, al.year, al.pinned, ar.name AS artistName,
        count(t.id) AS trackCount,
        coalesce(sum(t.status = 'on_disk'), 0) AS onDiskCount,
        coalesce(sum(t.status IN ('wanted', 'downloading')), 0) AS wantedCount,
        (SELECT t2.id FROM tracks t2 WHERE t2.album_id = al.id AND t2.status = 'on_disk'
          ORDER BY coalesce(t2.disc_number, 1), t2.track_number IS NULL, t2.track_number, t2.id
          LIMIT 1) AS firstTrackId
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      LEFT JOIN tracks t ON t.album_id = al.id AND t.status IN ${IN_LIBRARY}
      WHERE al.artist_id = ${artistId}
      GROUP BY al.id
      HAVING count(t.id) > 0 OR al.pinned = 1
      ORDER BY al.year IS NULL, al.year DESC, al.title COLLATE NOCASE, al.id
    `);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      coverUrl: artworkPath('album', row.id),
      artist: { id: artistId, name: row.artistName },
      trackCount: row.trackCount,
      onDiskCount: row.onDiskCount,
      firstTrackId: row.firstTrackId,
      wantedCount: row.wantedCount,
      missingCount: row.trackCount - row.onDiskCount,
      pinned: row.pinned === 1,
    }));
  }

  /**
   * The artist's other releases: tracks stored, none in the library, at least one that could be
   * downloaded. Newest year first (flat album listings carry no year, so most have none), then
   * the order the sync recorded them (the Releases tab lists newest first).
   */
  private notInLibrary(artistId: number): OtherRelease[] {
    const rows = this.db.all<{
      id: number;
      title: string;
      year: number | null;
      youtubeId: string | null;
      trackCount: number | null;
      stored: number;
    }>(sql`
      SELECT al.id, al.title, al.year, al.youtube_id AS youtubeId, al.track_count AS trackCount,
        count(t.id) AS stored
      FROM albums al
      JOIN tracks t ON t.album_id = al.id
      WHERE al.artist_id = ${artistId} AND al.pinned = 0
      GROUP BY al.id
      HAVING sum(t.status IN ${IN_LIBRARY}) = 0
        AND sum(t.status = 'skipped' AND coalesce(t.skip_reason, '') <> 'unavailable') > 0
      ORDER BY al.year IS NULL, al.year DESC, al.id
    `);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      coverUrl: artworkPath('album', row.id),
      trackCount: row.trackCount ?? row.stored,
      youtubeUrl: row.youtubeId === null ? null : albumUrl(row.youtubeId),
    }));
  }
}
