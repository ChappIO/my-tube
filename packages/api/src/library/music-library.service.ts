import { existsSync } from 'node:fs';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RECENT_TRACK_DAYS,
  artworkPath,
  audioMimeType,
  type AlbumListItem,
  type AlbumListQuery,
  type ArtistListItem,
  type ArtworkPath,
  type LibrarySummary,
  type PlaylistListItem,
  type TrackListItem,
  type TrackListQuery,
  type TrackPage,
  type TrackSort,
} from '@mytube/shared';
import { type SQL, and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database, foldText } from '../database/database.module.js';
import { albums, artists, playlistItems, playlists, sources, tracks } from '../database/schema.js';
import { OutsideLibraryError, libraryPath } from '../files/media-files.js';

type TrackRow = typeof tracks.$inferSelect;
type ArtistRow = typeof artists.$inferSelect;
type AlbumRow = typeof albums.$inferSelect;

/**
 * The statuses of a track that is part of the library: the rules want it (wanted, downloading)
 * or it is (or was) on disk. Skipped tracks (rules, deleted, unavailable) are not counted.
 */
export const LIBRARY_TRACK_STATUSES = ['wanted', 'downloading', 'on_disk', 'missing'] as const;
const IN_LIBRARY = sql.raw(`('${LIBRARY_TRACK_STATUSES.join("','")}')`);

/** A file the player streams. */
export interface TrackStream {
  path: string;
  contentType: string | null;
}

/**
 * The music read models: the Artists, Albums and Playlists tabs, one track and its stream (the
 * player), the queues of a playlist and of an artist's Play all, the filterable Tracks tab, the
 * music items of Home and the Music header sub.
 */
@Injectable()
export class MusicLibraryService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
  ) {}

  /**
   * Artists with a track in the library or added as a source, by name. `albumCount` counts their
   * albums on the Albums tab, `trackCount` their tracks in the library.
   */
  listArtists(): ArtistListItem[] {
    const rows = this.db.all<{
      id: number;
      name: string;
      avatarUrl: string | null;
      sourceId: number | null;
      subscribed: number | null;
      trackCount: number;
      albumCount: number;
    }>(sql`
      SELECT a.id, a.name, a.avatar_url AS avatarUrl, a.source_id AS sourceId,
        s.subscribed AS subscribed,
        (SELECT count(*) FROM tracks t WHERE t.artist_id = a.id AND t.status IN ${IN_LIBRARY})
          AS trackCount,
        (SELECT count(*) FROM albums al WHERE al.artist_id = a.id AND EXISTS (
          SELECT 1 FROM tracks t WHERE t.album_id = al.id AND t.status IN ${IN_LIBRARY}))
          AS albumCount
      FROM artists a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.source_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM tracks t WHERE t.artist_id = a.id AND t.status IN ${IN_LIBRARY})
      ORDER BY a.name COLLATE NOCASE, a.id
    `);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl === null ? null : artworkPath('artist', row.id),
      subscribed: row.subscribed === 1,
      sourceId: row.sourceId,
      albumCount: row.albumCount,
      trackCount: row.trackCount,
    }));
  }

  /**
   * Albums with at least one track in the library, by artist, newest year first, then title.
   * `trackCount` is the album's tracks in the library, `onDiskCount` those on disk.
   */
  listAlbums(query: AlbumListQuery = {}): AlbumListItem[] {
    const artistFilter =
      query.artistId === undefined ? sql`` : sql`AND al.artist_id = ${query.artistId}`;
    const rows = this.db.all<{
      id: number;
      title: string;
      year: number | null;
      artistId: number;
      artistName: string;
      trackCount: number;
      onDiskCount: number;
      firstTrackId: number | null;
    }>(sql`
      SELECT al.id, al.title, al.year, al.artist_id AS artistId, ar.name AS artistName,
        count(t.id) AS trackCount,
        coalesce(sum(t.status = 'on_disk'), 0) AS onDiskCount,
        (SELECT t2.id FROM tracks t2 WHERE t2.album_id = al.id AND t2.status = 'on_disk'
          ORDER BY coalesce(t2.disc_number, 1), t2.track_number IS NULL, t2.track_number, t2.id
          LIMIT 1) AS firstTrackId
      FROM albums al
      JOIN artists ar ON ar.id = al.artist_id
      JOIN tracks t ON t.album_id = al.id AND t.status IN ${IN_LIBRARY}
      WHERE 1 = 1 ${artistFilter}
      GROUP BY al.id
      ORDER BY ar.name COLLATE NOCASE, al.year IS NULL, al.year DESC, al.title COLLATE NOCASE, al.id
    `);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      // Every listed album has art: its cover, else the first track's thumbnail.
      coverUrl: artworkPath('album', row.id),
      artist: { id: row.artistId, name: row.artistName },
      trackCount: row.trackCount,
      onDiskCount: row.onDiskCount,
      firstTrackId: row.firstTrackId,
    }));
  }

  /**
   * The Music library's synced playlists (linked to a source, or with an item on disk), by name.
   * Counts and duration over the tracks in the library at its positions; the covers of the
   * first four on disk.
   */
  listPlaylists(): PlaylistListItem[] {
    const rows = this.db.all<{
      id: number;
      name: string;
      sourceId: number | null;
      trackCount: number;
      onDiskCount: number;
      durationSeconds: number;
    }>(sql`
      SELECT p.id, p.name, p.source_id AS sourceId,
        count(t.id) AS trackCount,
        coalesce(sum(t.status = 'on_disk'), 0) AS onDiskCount,
        coalesce(sum(t.duration_seconds), 0) AS durationSeconds
      FROM playlists p
      LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
      LEFT JOIN tracks t ON t.id = pi.track_id AND t.status IN ${IN_LIBRARY}
      WHERE p.library = 'music'
      GROUP BY p.id
      HAVING p.source_id IS NOT NULL OR onDiskCount > 0
      ORDER BY p.name COLLATE NOCASE, p.id
    `);
    return rows.map((row) => {
      const onDisk = this.db.all<{ id: number; albumId: number | null; hasCover: number }>(sql`
        SELECT t.id, t.album_id AS albumId, (al.cover_url IS NOT NULL) AS hasCover
        FROM playlist_items pi
        JOIN tracks t ON t.id = pi.track_id AND t.status = 'on_disk'
        LEFT JOIN albums al ON al.id = t.album_id
        WHERE pi.playlist_id = ${row.id}
        ORDER BY pi.position
      `);
      // Distinct art only: three tracks of one album are one cover, not three.
      const covers = [
        ...new Set(
          onDisk.map((track) =>
            track.albumId !== null && track.hasCover === 1
              ? artworkPath('album', track.albumId)
              : artworkPath('track', track.id),
          ),
        ),
      ].slice(0, 4);
      return { ...row, covers, firstTrackId: onDisk[0]?.id ?? null };
    });
  }

  /**
   * The Tracks tab: tracks in the library, filtered (`all`, `missing` = not on disk, `recent` =
   * downloaded in the last `RECENT_TRACK_DAYS`) and matched by `q` (title, artist or album,
   * folded: case and accents ignored), sorted by a column with keyset pagination. Rows without
   * the sort value come last in both directions; ties go by id in the same direction. `total`
   * counts the matches, `libraryTotal` the whole library.
   */
  listTracks(query: TrackListQuery, now = new Date()): TrackPage {
    const since = new Date(now.getTime() - RECENT_TRACK_DAYS * 86_400_000).toISOString();
    const conditions: SQL[] = [inArray(tracks.status, [...LIBRARY_TRACK_STATUSES])];
    if (query.filter === 'missing') conditions.push(ne(tracks.status, 'on_disk'));
    if (query.filter === 'recent') conditions.push(gte(tracks.downloadedAt, since));
    const needle = query.q ? foldText(query.q) : '';
    if (needle !== '') {
      conditions.push(sql`(
        instr(mytube_fold(${tracks.title}), ${needle}) > 0
        OR instr(mytube_fold(${artists.name}), ${needle}) > 0
        OR instr(mytube_fold(coalesce(${albums.title}, '')), ${needle}) > 0)`);
    }
    const matching = and(...conditions);

    const { value, empty } = TRACK_SORT_COLUMNS[query.sort];
    // Rows without a value sort last: the flag first, then the value (with a stand-in so the
    // comparison of flagged rows falls through to the id).
    const missingFlag = sql<number>`(${value} IS NULL)`;
    const sortValue = sql<string | number>`coalesce(${value}, ${empty})`;
    const descending = query.dir === 'desc';
    const cmp = sql.raw(descending ? '<' : '>');
    const order = sql.raw(descending ? 'DESC' : 'ASC');
    const pageConditions = [matching];
    if (query.cursor !== undefined) {
      const [flag, after, id] = decodeTrackCursor(query.cursor);
      pageConditions.push(sql`(${missingFlag} > ${flag} OR (${missingFlag} = ${flag} AND (
        ${sortValue} ${cmp} ${after} OR (${sortValue} = ${after} AND ${tracks.id} ${cmp} ${id}))))`);
    }

    const rows = this.db
      .select({ track: tracks, artist: artists, album: albums, missingFlag, sortValue })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(and(...pageConditions))
      .orderBy(missingFlag, sql`${sortValue} ${order}`, sql`${tracks.id} ${order}`)
      .limit(query.limit + 1)
      .all();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const count = (where: SQL | undefined) =>
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(tracks)
        .innerJoin(artists, eq(artists.id, tracks.artistId))
        .leftJoin(albums, eq(albums.id, tracks.albumId))
        .where(where)
        .get()?.count ?? 0;
    return {
      items: page.map((row) => toTrackItem(row.track, row.artist, row.album)),
      total: count(matching),
      libraryTotal: count(inArray(tracks.status, [...LIBRARY_TRACK_STATUSES])),
      nextCursor:
        rows.length > query.limit && last
          ? encodeTrackCursor(last.missingFlag, last.sortValue, last.track.id)
          : null,
    };
  }

  /** One track with its artist and album; 404 when unknown. */
  getTrack(id: number): TrackListItem {
    const row = this.trackRow(id);
    return toTrackItem(row.track, row.artist, row.album);
  }

  /** Tracks on disk downloaded since `since`, newest first, for Home. */
  recentTracks(since: string, limit: number): TrackListItem[] {
    return this.db
      .select({ track: tracks, artist: artists, album: albums })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(and(eq(tracks.status, 'on_disk'), gte(tracks.downloadedAt, since)))
      .orderBy(desc(tracks.downloadedAt), desc(tracks.id))
      .limit(limit)
      .all()
      .map((row) => toTrackItem(row.track, row.artist, row.album));
  }

  /** The Music header sub: the three tabs' counts and the subscribed artists. */
  summary(): LibrarySummary['music'] {
    const subscriptions = this.db
      .select({ count: sql<number>`count(*)` })
      .from(sources)
      .where(
        and(eq(sources.library, 'music'), eq(sources.kind, 'artist'), eq(sources.subscribed, true)),
      )
      .get();
    return {
      artists: this.listArtists().length,
      albums: this.listAlbums().length,
      playlists: this.listPlaylists().length,
      artistSubscriptions: subscriptions?.count ?? 0,
    };
  }

  /**
   * The playlist's tracks on disk in playlist order: the player's queue for a playlist tile.
   * 404 for an unknown playlist or one of the Video library.
   */
  playlistTracks(id: number): TrackListItem[] {
    const playlist = this.db
      .select({ id: playlists.id })
      .from(playlists)
      .where(and(eq(playlists.id, id), eq(playlists.library, 'music')))
      .get();
    if (!playlist) throw new NotFoundException(`Playlist ${id} not found`);
    return this.db
      .select({ track: tracks, artist: artists, album: albums })
      .from(playlistItems)
      .innerJoin(tracks, eq(tracks.id, playlistItems.trackId))
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(and(eq(playlistItems.playlistId, id), eq(tracks.status, 'on_disk')))
      .orderBy(playlistItems.position, playlistItems.id)
      .all()
      .map((row) => toTrackItem(row.track, row.artist, row.album));
  }

  /**
   * The artist's tracks on disk in library order, the player's queue for **Play all**: albums as
   * the artist page lists them (newest year first, then title), each by disc and track number;
   * tracks without an album last. 404 for an unknown artist.
   */
  artistTracks(id: number): TrackListItem[] {
    const artist = this.db.select({ id: artists.id }).from(artists).where(eq(artists.id, id)).get();
    if (!artist) throw new NotFoundException(`Artist ${id} not found`);
    return this.db
      .select({ track: tracks, artist: artists, album: albums })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(and(eq(tracks.artistId, id), eq(tracks.status, 'on_disk')))
      .orderBy(
        sql`${albums.id} IS NULL`,
        sql`${albums.year} IS NULL`,
        sql`${albums.year} DESC`,
        sql`${albums.title} COLLATE NOCASE`,
        albums.id,
        sql`coalesce(${tracks.discNumber}, 1)`,
        sql`${tracks.trackNumber} IS NULL`,
        tracks.trackNumber,
        tracks.id,
      )
      .all()
      .map((row) => toTrackItem(row.track, row.artist, row.album));
  }

  /** The file of an on-disk track for the player. 404 when there is none; 403 outside the mount. */
  streamTarget(id: number): TrackStream {
    const { track } = this.trackRow(id);
    if (track.status !== 'on_disk' || !track.filePath) {
      throw new NotFoundException(`Track ${id} is not on disk`);
    }
    const path = this.insideMusicDir(track.filePath);
    if (!existsSync(path)) throw new NotFoundException(`The file of track ${id} is missing`);
    return { path, contentType: audioMimeType(track.filePath) };
  }

  private trackRow(id: number): { track: TrackRow; artist: ArtistRow; album: AlbumRow | null } {
    const row = this.db
      .select({ track: tracks, artist: artists, album: albums })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(eq(tracks.id, id))
      .get();
    if (!row) throw new NotFoundException(`Track ${id} not found`);
    return row;
  }

  private insideMusicDir(filePath: string): string {
    try {
      return libraryPath(this.config.musicDir, filePath);
    } catch (error) {
      if (error instanceof OutsideLibraryError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}

/**
 * The value each Tracks sort orders by, and the stand-in for rows without one. Text is folded
 * (`mytube_fold`), so `émile` sorts with `emile` and case does not matter.
 */
const TRACK_SORT_COLUMNS: Record<TrackSort, { value: SQL; empty: SQL }> = {
  title: { value: sql`mytube_fold(${tracks.title})`, empty: sql`''` },
  artist: { value: sql`mytube_fold(${artists.name})`, empty: sql`''` },
  album: { value: sql`mytube_fold(${albums.title})`, empty: sql`''` },
  length: { value: sql`${tracks.durationSeconds}`, empty: sql`0` },
  added: { value: sql`${tracks.downloadedAt}`, empty: sql`''` },
};

/** The Tracks cursor: the last row's missing-value flag, sort value and id (base64url JSON). */
export function encodeTrackCursor(flag: number, value: string | number, id: number): string {
  return Buffer.from(JSON.stringify([flag, value, id])).toString('base64url');
}

export function decodeTrackCursor(cursor: string): [number, string | number, number] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 3) {
      const [flag, value, id]: unknown[] = parsed;
      if (
        (flag === 0 || flag === 1) &&
        (typeof value === 'string' || typeof value === 'number') &&
        typeof id === 'number' &&
        Number.isInteger(id)
      ) {
        return [flag, value, id];
      }
    }
  } catch {
    // Falls through to the 400.
  }
  throw new BadRequestException('Invalid cursor');
}

/** The art of a track: its album's cover when there is one, else its own thumbnail. */
export function trackCover(track: TrackRow, album: AlbumRow | null): ArtworkPath | null {
  if (album?.coverUrl) return artworkPath('album', album.id);
  const onDisk = track.status === 'on_disk' && track.filePath !== null;
  if (track.thumbnailUrl !== null || onDisk) return artworkPath('track', track.id);
  return album ? artworkPath('album', album.id) : null;
}

/** A `tracks` row with its artist and album as the list DTO, art pointing at the cache. */
export function toTrackItem(
  track: TrackRow,
  artist: ArtistRow,
  album: AlbumRow | null,
): TrackListItem {
  const onDisk = track.status === 'on_disk' && track.filePath !== null;
  return {
    ...track,
    coverUrl: trackCover(track, album),
    mimeType: onDisk ? audioMimeType(track.filePath!) : null,
    artist: {
      id: artist.id,
      name: artist.name,
      avatarUrl: artist.avatarUrl === null ? null : artworkPath('artist', artist.id),
      sourceId: artist.sourceId,
    },
    album: album
      ? {
          id: album.id,
          title: album.title,
          year: album.year,
          coverUrl: artworkPath('album', album.id),
        }
      : null,
  };
}
