import type { Logger } from '@nestjs/common';
import type { SkipReason } from '@mytube/shared';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { albums, artists, playlistItems, playlists, sources, tracks } from '../database/schema.js';
import type { JobsService } from '../jobs/jobs.service.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { SourceEntry, SourceMetadata } from '../ytdlp/metadata.js';
import type { NetworkOptions } from '../ytdlp/args.js';
import { YtdlpError } from '../ytdlp/ytdlp-error.js';
import type { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { cleanTrackTitle } from '../metadata/clean-title.js';
import { onPinnedAlbum, wantedElsewhere } from './claims.js';
import { entryContext, evaluateItem } from './rules.js';
import type { CheckContext, ListingResult } from './sync.service.js';

type SourceRow = typeof sources.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const DAY_MS = 86_400_000;
/** Tracks fetched per album listing. Albums are short; this only guards against odd ones. */
export const ALBUM_TRACK_LIMIT = 200;

/** YouTube's auto-generated artist channels are named `<Artist> - Topic`. */
const TOPIC_SUFFIX = / - Topic$/;

/** One release (album or single) from an artist's Releases tab, with its listed tracks. */
export interface AlbumListing {
  /** The album playlist id (`OLAK5uy_…`). */
  youtubeId: string;
  title: string;
  /** The album cover (`albumCover`: the largest signed thumbnail of the playlist). */
  coverUrl: string | null;
  /** Tracks YouTube reports for the album. */
  trackCount: number | null;
  /** The album's tracks in album order. */
  entries: SourceEntry[];
}

/** One track the sync records: the entry and where it belongs. */
export interface TrackInput {
  entry: SourceEntry;
  artistId: number;
  /** The album to file it under, or null (fallback listings without an album). */
  albumId: number | null;
  /** 1-based number on the album. */
  trackNumber: number | null;
  /** 1-based position in a playlist source's listing, for the matcher. */
  playlistPosition: number | null;
}

/** Tracks of one fallback listing, grouped by yt-dlp's `album` field (null: no album). */
export interface AlbumGroup {
  album: string | null;
  entries: SourceEntry[];
}

/**
 * Groups a fallback listing (an artist's uploads when the Releases tab is empty or missing) by
 * the `album` yt-dlp reports, keeping the listing's order inside each group and the order in
 * which the albums first appear. Entries without an album form the one `album: null` group.
 */
export function groupByAlbum(entries: readonly SourceEntry[]): AlbumGroup[] {
  const groups = new Map<string | null, AlbumGroup>();
  for (const entry of entries) {
    const album = entry.music?.album?.trim() || null;
    let group = groups.get(album);
    if (!group) {
      group = { album, entries: [] };
      groups.set(album, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

/** The artist name for an uploader: YouTube's auto-generated `<Artist> - Topic` channels. */
export function artistName(channel: string | null): string | null {
  const name = channel?.replace(TOPIC_SUFFIX, '').trim();
  return name || null;
}

function area(thumbnail: { width?: number | null; height?: number | null }): number {
  return (thumbnail.width ?? 0) * (thumbnail.height ?? 0);
}

/**
 * The cover of an album playlist: the largest signed thumbnail. YouTube lists a 1200 × 1200
 * `maxresdefault.jpg` without a signature, which answers 404; the signed `sddefault.jpg`
 * (640 × 640) is the largest that loads. The largest of any kind when none is signed.
 */
export function albumCover(metadata: SourceMetadata): string | null {
  const signed = metadata.thumbnails
    .filter((thumbnail) => thumbnail.url.includes('?'))
    .toSorted((a, b) => area(b) - area(a));
  return signed[0]?.url ?? metadata.thumbnailUrl;
}

/** An album listing from the metadata of its playlist. */
export function toAlbumListing(metadata: SourceMetadata): AlbumListing {
  return {
    youtubeId: metadata.id,
    title: metadata.title,
    coverUrl: albumCover(metadata),
    trackCount: metadata.playlistCount,
    entries: metadata.entries.filter((entry) => entry.kind === 'video'),
  };
}

/** The Releases tab of an artist (flat: album playlists, newest first). */
export function releasesUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}/releases`;
}

/** An artist's uploads, the fallback when the Releases tab is empty or missing. */
export function uploadsUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}/videos`;
}

/**
 * An album playlist on YouTube Music. yt-dlp redirects it to the YouTube playlist, and the
 * listing is the album in order.
 */
export function albumUrl(playlistId: string): string {
  return `https://music.youtube.com/playlist?list=${playlistId}`;
}

export interface MusicCheck {
  /** Track entries seen across the listings. */
  entries: number;
  added: number;
  /** `tracks.id` of the listing's entries that are `wanted` now. */
  wantedIds: number[];
}

/**
 * The music half of the sync, used by `SyncService.checkSource` for Music sources:
 *
 * - **Artist**: the Releases tab (`/channel/<id>/releases`, flat) lists the artist's albums and
 *   singles as album playlists. Each album not fetched before is listed on YouTube Music and
 *   recorded: an `albums` row (title, cover, track count, the playlist id) and a `tracks` row per
 *   entry with its album and track number (the playlist index). Singles are one-track albums.
 *   An album is fetched once; later checks only fetch new releases (the listing's first 60).
 *   When the tab is empty or missing, the artist's uploads are recorded instead, grouped by the
 *   `album` yt-dlp reports (tracks without one keep `album_id` null until the download reads the
 *   album from the track's own metadata).
 * - **Playlist**: its tracks in order, each under the artist of its uploader, with the positions
 *   in `playlist_items`.
 *
 * Each track goes through `evaluateItem` like a video (streams and premieres are transient;
 * shorts are not music and are not recorded) and the same status moves (`nextStatus`). Wanted
 * tracks get a `download` job with a `trackId` (key `track:<youtube id>`).
 */
export class MusicSync {
  constructor(
    private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    private readonly logger: Logger,
    private readonly nextStatus: NextStatus,
  ) {}

  async check(
    source: SourceRow,
    network: NetworkOptions,
    limit: number,
    ctx: CheckContext,
  ): Promise<MusicCheck> {
    if (source.kind === 'playlist') {
      const metadata = await this.runner.metadata(source.url, {
        limit,
        network,
        session: ctx.session,
        signal: ctx.signal,
        log: ctx.log,
      });
      ctx.signal?.throwIfAborted();
      return this.applyPlaylist(source, metadata, new Date());
    }
    return this.checkArtist(source, network, limit, ctx);
  }

  private async checkArtist(
    source: SourceRow,
    network: NetworkOptions,
    limit: number,
    ctx: CheckContext,
  ): Promise<MusicCheck> {
    const artistId = this.sourceArtist(source);
    let releases: SourceEntry[] = [];
    try {
      const metadata = await this.runner.metadata(releasesUrl(source.youtubeId), {
        limit,
        network,
        session: ctx.session,
        signal: ctx.signal,
        log: ctx.log,
      });
      releases = metadata.entries.filter((entry) => entry.kind === 'playlist');
    } catch (error) {
      // A channel without a Releases tab answers with an error; its uploads are the fallback.
      if (!(error instanceof YtdlpError) || error.kind !== 'exit') throw error;
      ctx.log?.(`No releases tab (${error.reason ?? error.message}); listing the uploads.`);
    }
    ctx.signal?.throwIfAborted();

    const total: MusicCheck = { entries: 0, added: 0, wantedIds: [] };
    if (releases.length === 0) {
      const metadata = await this.runner.metadata(uploadsUrl(source.youtubeId), {
        limit,
        network,
        session: ctx.session,
        signal: ctx.signal,
        log: ctx.log,
      });
      ctx.signal?.throwIfAborted();
      return this.applyUploads(source, artistId, metadata, new Date());
    }

    const known = new Set(
      this.db
        .select({ youtubeId: albums.youtubeId })
        .from(albums)
        .where(and(isNotNull(albums.youtubeId), isNotNull(albums.trackCount)))
        .all()
        .map((row) => row.youtubeId),
    );
    const pending = releases.filter((release) => !known.has(release.id));
    ctx.log?.(`${releases.length} releases, ${pending.length} not fetched before`);
    let failures = 0;
    let lastError: unknown = null;
    for (const release of pending) {
      ctx.signal?.throwIfAborted();
      let metadata: SourceMetadata;
      try {
        metadata = await this.runner.metadata(albumUrl(release.id), {
          limit: ALBUM_TRACK_LIMIT,
          network,
          session: ctx.session,
          signal: ctx.signal,
          log: ctx.log,
        });
      } catch (error) {
        if (ctx.signal?.aborted) throw error;
        // One album that does not list (region-locked, removed) does not stop the others; it is
        // tried again on the next check.
        failures++;
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        ctx.log?.(`Could not list ${release.title ?? release.id}: ${message}`);
        this.logger.warn(`Could not list album ${release.id} of ${source.name}: ${message}`);
        continue;
      }
      const listing = toAlbumListing({ ...metadata, id: release.id });
      if (!listing.title || listing.title === release.id)
        listing.title = release.title ?? release.id;
      const result = this.applyAlbum(source, artistId, listing, new Date());
      total.entries += result.entries;
      total.added += result.added;
      total.wantedIds.push(...result.wantedIds);
    }
    if (pending.length > 0 && failures === pending.length) throw lastError;
    // A track on a single and on its album is listed twice.
    total.wantedIds = [...new Set(total.wantedIds)];
    return total;
  }

  /**
   * Records one album of an artist source: the `albums` row (by playlist id) and its tracks in
   * album order. Pure database work in one transaction; `now` is the rules' clock.
   */
  applyAlbum(source: SourceRow, artistId: number, album: AlbumListing, now: Date): ListingResult {
    return this.db.transaction((tx) => {
      const stamp = now.toISOString();
      const values = {
        artistId,
        youtubeId: album.youtubeId,
        title: album.title,
        coverUrl: album.coverUrl,
        trackCount: album.trackCount ?? album.entries.length,
        updatedAt: stamp,
      };
      const albumId = tx
        .insert(albums)
        .values({ ...values, createdAt: stamp })
        .onConflictDoUpdate({
          target: albums.youtubeId,
          set: {
            title: values.title,
            coverUrl: sql`coalesce(${values.coverUrl}, ${albums.coverUrl})`,
            trackCount: values.trackCount,
            updatedAt: stamp,
          },
        })
        .returning({ id: albums.id })
        .get().id;
      const inputs = album.entries.map((entry, index): TrackInput => ({
        entry,
        artistId,
        albumId,
        trackNumber: index + 1,
        playlistPosition: null,
      }));
      return this.applyTracks(tx, source, inputs, now);
    });
  }

  /**
   * Records an artist's uploads (no Releases tab), grouped by album where yt-dlp names one.
   * Albums found this way have no playlist id and are matched by artist and title.
   */
  applyUploads(
    source: SourceRow,
    artistId: number,
    metadata: SourceMetadata,
    now: Date,
  ): ListingResult {
    const entries = metadata.entries.filter((entry) => entry.kind === 'video' && !entry.isShort);
    return this.db.transaction((tx) => {
      const inputs: TrackInput[] = [];
      for (const group of groupByAlbum(entries)) {
        const albumId = group.album === null ? null : albumByTitle(tx, artistId, group.album, now);
        group.entries.forEach((entry, index) =>
          inputs.push({
            entry,
            artistId,
            albumId,
            trackNumber: group.album === null ? null : (entry.music?.trackNumber ?? index + 1),
            playlistPosition: null,
          }),
        );
      }
      return this.applyTracks(tx, source, inputs, now);
    });
  }

  /**
   * Records a music playlist source: each entry under the artist of its uploader (the playlist
   * owner as the fallback), then the positions in `playlist_items` and the playlist's count.
   */
  applyPlaylist(source: SourceRow, metadata: SourceMetadata, now: Date): ListingResult {
    const entries = metadata.entries.filter((entry) => entry.kind === 'video');
    return this.db.transaction((tx) => {
      const inputs = entries.map((entry, index): TrackInput => ({
        entry,
        artistId: artistOf(
          tx,
          entry.channelId ?? metadata.channelId,
          artistName(entry.channel) ?? artistName(metadata.channel),
          now,
        ),
        albumId: null,
        trackNumber: null,
        playlistPosition: index + 1,
      }));
      const result = this.applyTracks(tx, source, inputs, now);
      storeTrackPositions(tx, source, metadata, result.storedIds, now.toISOString());
      return result;
    });
  }

  /** Upserts tracks and evaluates the source's rules on each (see the class comment). */
  applyTracks(
    tx: Transaction,
    source: SourceRow,
    inputs: readonly TrackInput[],
    now: Date,
  ): ListingResult & { storedIds: number[] } {
    const stamp = now.toISOString();
    const artistNames = new Map<number, string | null>();
    const nameOf = (id: number) => {
      if (!artistNames.has(id)) {
        artistNames.set(
          id,
          tx.select({ name: artists.name }).from(artists).where(eq(artists.id, id)).get()?.name ??
            null,
        );
      }
      return artistNames.get(id) ?? null;
    };
    let added = 0;
    const wantedIds: number[] = [];
    const storedIds: number[] = [];
    for (const input of inputs) {
      const { entry } = input;
      // Shorts are not music: never recorded.
      if (entry.isShort) continue;
      // Upload decoration and the artist prefix are not part of a song's title; the rules see
      // the title the library shows.
      const title = cleanTrackTitle(entry.title ?? entry.id, nameOf(input.artistId));
      const track = { ...entry, title, isShort: false };
      const entryCtx = {
        now,
        channelName: entry.channel === null ? nameOf(input.artistId) : null,
        channelId: entry.channelId === null ? source.youtubeId : null,
        playlistPosition: input.playlistPosition,
      };
      let verdict = evaluateItem(track, source.matcher, entryCtx);
      if (!verdict.accept && verdict.transient) continue;
      const existing = tx.select().from(tracks).where(eq(tracks.youtubeId, entry.id)).get();
      // A track on a pinned album counts as matching: the user asked for the whole album.
      if (!verdict.accept && onPinnedAlbum(tx, existing?.albumId ?? input.albumId)) {
        verdict = { accept: true };
      }
      const fields = {
        title,
        durationSeconds: entry.duration === null ? null : Math.round(entry.duration),
        publishedAt: entry.uploadDate,
        thumbnailUrl: trackThumbnail(entry),
        // The listing's badge is current: a members-only upload made public loses it.
        availability: entry.availability,
      };
      let id: number;
      let status = existing?.status;
      if (!existing) {
        const skip: SkipReason | null = verdict.accept ? null : verdict.reason;
        id = tx
          .insert(tracks)
          .values({
            ...fields,
            albumId: input.albumId,
            artistId: input.artistId,
            sourceId: source.id,
            youtubeId: entry.id,
            trackNumber: input.trackNumber,
            status: skip ? 'skipped' : 'wanted',
            skipReason: skip,
            createdAt: stamp,
            updatedAt: stamp,
          })
          .returning({ id: tracks.id })
          .get().id;
        status = skip ? 'skipped' : 'wanted';
        added++;
      } else {
        id = existing.id;
        let next = this.nextStatus(existing.status, existing.skipReason, verdict);
        // Another source (a playlist, the artist) that still wants the track keeps it wanted.
        if (
          existing.status === 'wanted' &&
          next.status === 'skipped' &&
          wantedElsewhere(tx, 'tracks', id, source.id, {
            ...entryContext(track, entryCtx),
            playlistPosition: null,
          })
        ) {
          next = { status: 'wanted', skipReason: null };
        }
        status = next.status;
        // A track keeps the album it was first filed under (a single and its album can share
        // one video); its number follows that album's listing.
        const sameAlbum = existing.albumId === null || existing.albumId === input.albumId;
        tx.update(tracks)
          .set({
            title: fields.title,
            durationSeconds: fields.durationSeconds ?? existing.durationSeconds,
            publishedAt: existing.publishedAt ?? fields.publishedAt,
            thumbnailUrl: existing.thumbnailUrl ?? fields.thumbnailUrl,
            availability: fields.availability,
            albumId: existing.albumId ?? input.albumId,
            trackNumber:
              sameAlbum && input.trackNumber !== null ? input.trackNumber : existing.trackNumber,
            sourceId: existing.sourceId ?? source.id,
            status: next.status,
            skipReason: next.skipReason,
            updatedAt: stamp,
          })
          .where(eq(tracks.id, id))
          .run();
      }
      if (status === 'wanted') wantedIds.push(id);
      storedIds.push(id);
    }
    return { entries: inputs.length, added, wantedIds, storedIds };
  }

  /**
   * Enqueues downloads for `wanted` tracks, in listing order (same priority: oldest job first),
   * newest release first across albums. Returns how many were created. A track whose latest
   * download failed for good or was cancelled waits for an explicit retry, unless `explicit`
   * (the user asked for these tracks: the album page's Download missing). `source` is the tracks'
   * own source, null for tracks whose source was removed; it only matters for the positions of a
   * sync-ordered playlist.
   */
  enqueueDownloads(
    source: SourceRow | null,
    trackIds: readonly number[],
    { explicit = false }: { explicit?: boolean } = {},
  ): number {
    if (trackIds.length === 0) return 0;
    const settings = this.settings.get();
    const rows = this.db
      .select({ track: tracks, artistName: artists.name })
      .from(tracks)
      .innerJoin(artists, eq(artists.id, tracks.artistId))
      .where(and(inArray(tracks.id, [...trackIds]), eq(tracks.status, 'wanted')))
      .all();
    const order = new Map(trackIds.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.track.id) ?? 0) - (order.get(b.track.id) ?? 0));
    const positions =
      source?.kind === 'playlist' && source.options.syncOrder ? this.positions(source) : null;
    const today = Math.floor(Date.now() / DAY_MS);
    let created = 0;
    for (const { track, artistName: subtitle } of rows) {
      const key = `track:${track.youtubeId}`;
      const last = this.jobs.latestForKey('download', key);
      if (!explicit && last && (last.status === 'failed' || last.status === 'cancelled')) continue;
      const published = track.publishedAt ? Date.parse(track.publishedAt) : Number.NaN;
      const position = positions?.get(track.id);
      const result = this.jobs.enqueue({
        type: 'download',
        key,
        priority: Number.isNaN(published) ? today : Math.floor(published / DAY_MS),
        payload: {
          title: track.title,
          subtitle,
          historyKind: 'music',
          trackId: track.id,
          detail: settings.music.container,
          ...(position !== undefined && { position }),
        },
      });
      if (result.created) created++;
    }
    return created;
  }

  /** Tracks of the source's playlist by id → position (the first when listed twice). */
  private positions(source: SourceRow): Map<number, number> {
    const rows = this.db
      .select({ trackId: playlistItems.trackId, position: playlistItems.position })
      .from(playlistItems)
      .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
      .where(eq(playlists.youtubeId, source.youtubeId))
      .orderBy(playlistItems.position)
      .all();
    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.trackId !== null && !map.has(row.trackId)) map.set(row.trackId, row.position);
    }
    return map;
  }

  /** The `artists` row of an artist source (created when missing). */
  private sourceArtist(source: SourceRow): number {
    const linked = this.db
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.youtubeId, source.youtubeId))
      .get();
    if (linked) return linked.id;
    return this.db
      .insert(artists)
      .values({ youtubeId: source.youtubeId, name: source.name, sourceId: source.id })
      .returning({ id: artists.id })
      .get().id;
  }
}

export type NextStatus = (
  current: (typeof tracks.$inferSelect)['status'],
  skipReason: SkipReason | null,
  verdict: ReturnType<typeof evaluateItem>,
) => { status: (typeof tracks.$inferSelect)['status']; skipReason: SkipReason | null };

/** An album of `artistId` by title (fallback grouping), created when unknown. */
function albumByTitle(tx: Transaction, artistId: number, title: string, now: Date): number {
  const found = tx
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.artistId, artistId), sql`${albums.title} = ${title} COLLATE NOCASE`))
    .get();
  if (found) return found.id;
  const stamp = now.toISOString();
  return tx
    .insert(albums)
    .values({ artistId, title, createdAt: stamp, updatedAt: stamp })
    .returning({ id: albums.id })
    .get().id;
}

/**
 * The artist of an uploader: by channel id, else by name (case-insensitive), else a new row.
 * An entry without either is filed under "Unknown artist".
 */
export function artistOf(
  tx: Transaction | Database,
  youtubeId: string | null,
  name: string | null,
  now: Date,
): number {
  if (youtubeId) {
    const byId = tx
      .select({ id: artists.id })
      .from(artists)
      .where(eq(artists.youtubeId, youtubeId))
      .get();
    if (byId) return byId.id;
  }
  const label = name ?? 'Unknown artist';
  const byName = tx
    .select({ id: artists.id })
    .from(artists)
    .where(sql`${artists.name} = ${label} COLLATE NOCASE`)
    .get();
  if (byName) return byName.id;
  const stamp = now.toISOString();
  return tx
    .insert(artists)
    .values({ youtubeId, name: label, createdAt: stamp, updatedAt: stamp })
    .returning({ id: artists.id })
    .get().id;
}

/** Positions 1..n of a music playlist's stored tracks, and the playlist's count. */
function storeTrackPositions(
  tx: Transaction,
  source: SourceRow,
  metadata: SourceMetadata,
  trackIds: readonly number[],
  stamp: string,
): void {
  const playlist = tx
    .select({ id: playlists.id })
    .from(playlists)
    .where(eq(playlists.youtubeId, source.youtubeId))
    .get();
  if (!playlist) return;
  tx.delete(playlistItems)
    .where(
      and(
        eq(playlistItems.playlistId, playlist.id),
        sql`${playlistItems.position} <= ${Math.max(trackIds.length, 1)}`,
      ),
    )
    .run();
  for (const [index, trackId] of trackIds.entries()) {
    tx.insert(playlistItems)
      .values({ playlistId: playlist.id, position: index + 1, trackId })
      .onConflictDoUpdate({
        target: [playlistItems.playlistId, playlistItems.position],
        set: { trackId, videoId: null },
      })
      .run();
  }
  if (metadata.playlistCount !== null) {
    tx.update(playlists)
      .set({ itemCount: metadata.playlistCount, updatedAt: stamp })
      .where(eq(playlists.id, playlist.id))
      .run();
  }
}

/** The largest thumbnail of a track entry, else YouTube's `hqdefault` for its id. */
function trackThumbnail(entry: SourceEntry): string {
  let best: { url: string; size: number } | null = null;
  for (const thumbnail of entry.thumbnails) {
    const size = area(thumbnail);
    if (!best || size > best.size) best = { url: thumbnail.url, size };
  }
  return best?.url ?? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
}
