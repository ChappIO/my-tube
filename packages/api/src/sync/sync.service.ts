import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SkipReason } from '@mytube/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { channels, playlistItems, playlists, sources, videos } from '../database/schema.js';
import type { JobRow } from '../jobs/job-runner.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SettingsService } from '../settings/settings.service.js';
import type { SourceEntry, SourceMetadata } from '../ytdlp/metadata.js';
import { networkOptions } from '../ytdlp/network.js';
import { YtdlpRunner, type YtdlpLogSink } from '../ytdlp/ytdlp-runner.js';
import { evaluateItem } from './rules.js';

/** Entries fetched per channel tab (or playlist) on a source's first check. */
export const FIRST_CHECK_LIMIT = 200;
/** Entries fetched per tab on later checks: new uploads are at the top. */
export const CHECK_LIMIT = 60;

const DAY_MS = 86_400_000;

type SourceRow = typeof sources.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The source of a `check_source` job no longer exists. Retrying cannot help. */
export class SourceGoneError extends Error {
  override readonly name = 'SourceGoneError';
}

export interface CheckContext {
  signal?: AbortSignal;
  /** Job log sink for the yt-dlp output. */
  log?: YtdlpLogSink;
}

/** What one check found. */
export interface CheckResult {
  /** Video entries in the listing (transient ones included). */
  entries: number;
  /** Rows inserted into `videos`. */
  added: number;
  /** Videos of the listing that are `wanted` after the check. */
  wanted: number;
  /** Download jobs enqueued by this check. */
  queued: number;
  /** False for Music sources until Stage 6: marked checked, nothing fetched. */
  synced: boolean;
}

/** Result of applying a listing to the database (`applyListing`). */
export interface ListingResult {
  entries: number;
  added: number;
  /** `videos.id` of the listing's entries that are `wanted` now, in listing order. */
  wantedIds: number[];
}

/**
 * The sync: asks yt-dlp for a source's current listing, applies the source's rules to each
 * entry, records the entries as items and enqueues downloads for the ones the rules accept.
 *
 * - Accepted entries become `wanted` (unless already `downloading`, `on_disk` or `missing`; a
 *   rules-`skipped` item is accepted again when the rules changed). Rejected ones are stored
 *   `skipped` with the reason (never touching an item on disk or downloading); transient
 *   rejections (premieres, streams on air) are not stored and are seen again next time.
 * - A download is enqueued per `wanted` video (key `video:<youtube id>`, newest first) unless
 *   its latest download job failed for good or was cancelled: those wait for an explicit retry.
 * - Nothing is recorded in history for a check (too noisy); only a failed check is.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger('Sync');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
  ) {}

  /**
   * Enqueues a `check_source` job for the source (de-duplicated by `source:<id>`). Undefined
   * when the source does not exist.
   */
  enqueueCheck(sourceId: number): { job: JobRow; created: boolean } | undefined {
    const source = this.db.select().from(sources).where(eq(sources.id, sourceId)).get();
    if (!source) return undefined;
    return this.jobs.enqueue({
      type: 'check_source',
      key: `source:${source.id}`,
      payload: {
        title: source.name,
        subtitle: 'checking for new content',
        historyKind: source.library,
        sourceId: source.id,
      },
    });
  }

  /** Enqueues a check of every subscribed source. Returns the jobs (existing ones included). */
  enqueueAll(): JobRow[] {
    return this.db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.subscribed, true))
      .all()
      .flatMap(({ id }) => this.enqueueCheck(id)?.job ?? []);
  }

  /**
   * Subscribed sources due for a check at `now`: never checked, or last checked (or last
   * attempted, when the check failed) `general.checkIntervalHours` or more ago.
   */
  dueSources(now: Date): SourceRow[] {
    const intervalMs = this.settings.get().general.checkIntervalHours * 3_600_000;
    const cutoff = now.getTime() - intervalMs;
    return this.db
      .select()
      .from(sources)
      .where(eq(sources.subscribed, true))
      .all()
      .filter((source) => {
        if (source.lastCheckedAt !== null && Date.parse(source.lastCheckedAt) > cutoff) {
          return false;
        }
        // A check that failed for good does not update `last_checked_at`; wait a full interval
        // before trying again instead of failing every tick.
        const last = this.jobs.latestForKey('check_source', `source:${source.id}`);
        if (last?.status === 'failed' && last.finishedAt && Date.parse(last.finishedAt) > cutoff) {
          return false;
        }
        return true;
      });
  }

  /** Fetches, diffs and enqueues for one source. Throws `SourceGoneError` for a removed one. */
  async checkSource(sourceId: number, ctx: CheckContext = {}): Promise<CheckResult> {
    const source = this.db.select().from(sources).where(eq(sources.id, sourceId)).get();
    if (!source) throw new SourceGoneError(`Source ${sourceId} no longer exists`);

    if (source.library === 'music') {
      this.logger.log(`Skipping ${source.name}: music sync arrives in Stage 6`);
      ctx.log?.('Music sources are not synced yet (Stage 6). Marked as checked.');
      this.markChecked(source.id, new Date());
      return { entries: 0, added: 0, wanted: 0, queued: 0, synced: false };
    }

    const settings = this.settings.get();
    const metadata = await this.runner.metadata(source.url, {
      limit: source.lastCheckedAt === null ? FIRST_CHECK_LIMIT : CHECK_LIMIT,
      network: networkOptions(settings.network),
      signal: ctx.signal,
      log: ctx.log,
    });
    ctx.signal?.throwIfAborted();

    const now = new Date();
    const listing = this.applyListing(source, metadata, now);
    const queued = this.enqueueDownloads(source, listing.wantedIds);
    this.markChecked(source.id, now);
    const summary = `${listing.entries} entries, ${listing.added} new, ${listing.wantedIds.length} wanted, ${queued} queued`;
    this.logger.log(`Checked ${source.name}: ${summary}`);
    ctx.log?.(`Checked ${source.name}: ${summary}`);
    return {
      entries: listing.entries,
      added: listing.added,
      wanted: listing.wantedIds.length,
      queued,
      synced: true,
    };
  }

  /**
   * Records a listing of a video source: channel rows for every uploader, a `videos` row per
   * entry the rules do not reject transiently, and for playlists the positions. Pure database
   * work in one transaction; `now` is the rules' clock.
   */
  applyListing(source: SourceRow, metadata: SourceMetadata, now: Date): ListingResult {
    const entries = metadata.entries.filter((entry) => entry.kind === 'video');
    const playlist = source.kind === 'playlist';
    return this.db.transaction((tx) => {
      const channelIds = new Map<string, number>();
      const channelOf = (youtubeId: string | null, name: string | null): number | null => {
        if (!youtubeId) return null;
        const known = channelIds.get(youtubeId);
        if (known !== undefined) return known;
        tx.insert(channels)
          .values({ youtubeId, name: name ?? youtubeId })
          .onConflictDoNothing({ target: channels.youtubeId })
          .run();
        const row = tx
          .select({ id: channels.id })
          .from(channels)
          .where(eq(channels.youtubeId, youtubeId))
          .get();
        if (row) channelIds.set(youtubeId, row.id);
        return row?.id ?? null;
      };
      // The listed channel (flat channel listings carry no uploader per entry) or the
      // playlist's owner as the fallback.
      const ownerChannel =
        source.kind === 'playlist'
          ? () => channelOf(metadata.channelId, metadata.channel)
          : () => channelOf(source.youtubeId, source.name);

      const stamp = now.toISOString();
      let added = 0;
      const wantedIds: number[] = [];
      const positions: number[] = [];

      for (const [index, entry] of entries.entries()) {
        const verdict = evaluateItem(entry, source.matcher, {
          now,
          // A channel's flat listing names no uploader: it is the channel itself. A playlist's
          // entries name theirs; the owner is not a stand-in for them.
          channelName: playlist ? null : source.name,
          channelId: playlist ? null : source.youtubeId,
          playlistPosition: playlist ? index + 1 : null,
        });
        if (!verdict.accept && verdict.transient) continue;
        const channelId =
          (source.kind === 'playlist' ? channelOf(entry.channelId, entry.channel) : null) ??
          ownerChannel();
        if (channelId === null) {
          this.logger.warn(`Skipping ${entry.id} of ${source.name}: no channel in the listing`);
          continue;
        }
        const existing = tx.select().from(videos).where(eq(videos.youtubeId, entry.id)).get();
        const fields = entryFields(entry);
        let id: number;
        let status = existing?.status;
        if (!existing) {
          const skip: SkipReason | null = verdict.accept ? null : verdict.reason;
          id = tx
            .insert(videos)
            .values({
              ...fields,
              channelId,
              sourceId: source.id,
              youtubeId: entry.id,
              status: skip ? 'skipped' : 'wanted',
              skipReason: skip,
              createdAt: stamp,
              updatedAt: stamp,
            })
            .returning({ id: videos.id })
            .get().id;
          status = skip ? 'skipped' : 'wanted';
          added++;
        } else {
          id = existing.id;
          const next = nextStatus(existing.status, existing.skipReason, verdict);
          status = next.status;
          tx.update(videos)
            .set({
              title: fields.title,
              durationSeconds: fields.durationSeconds ?? existing.durationSeconds,
              // The download stores the exact date; a flat listing's date is approximate.
              publishedAt: existing.publishedAt ?? fields.publishedAt,
              thumbnailUrl: fields.thumbnailUrl ?? existing.thumbnailUrl,
              isShort: fields.isShort,
              liveStatus: fields.liveStatus ?? existing.liveStatus,
              sourceId: existing.sourceId ?? source.id,
              status: next.status,
              skipReason: next.skipReason,
              updatedAt: stamp,
            })
            .where(eq(videos.id, id))
            .run();
        }
        if (status === 'wanted') wantedIds.push(id);
        positions.push(id);
      }

      if (source.kind === 'playlist') this.storePositions(tx, source, metadata, positions, stamp);
      return { entries: entries.length, added, wantedIds };
    });
  }

  /** Enqueues downloads for `wanted` videos, newest first. Returns how many were created. */
  enqueueDownloads(source: SourceRow, videoIds: readonly number[]): number {
    if (videoIds.length === 0) return 0;
    const settings = this.settings.get();
    const rows = this.db
      .select({ video: videos, channelName: channels.name })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(and(inArray(videos.id, [...videoIds]), eq(videos.status, 'wanted')))
      .all();
    const today = Math.floor(Date.now() / DAY_MS);
    let created = 0;
    for (const { video, channelName } of rows) {
      const key = `video:${video.youtubeId}`;
      const last = this.jobs.latestForKey('download', key);
      // Given up (failed for good) or cancelled by the user: only an explicit retry runs it.
      if (last && (last.status === 'failed' || last.status === 'cancelled')) continue;
      const published = video.publishedAt ? Date.parse(video.publishedAt) : Number.NaN;
      const result = this.jobs.enqueue({
        type: 'download',
        key,
        priority: Number.isNaN(published) ? today : Math.floor(published / DAY_MS),
        payload: {
          title: video.title,
          subtitle: channelName,
          historyKind: 'video',
          videoId: video.id,
          detail: settings.video.quality,
          ...(source.kind === 'playlist' && { playlist: source.name }),
        },
      });
      if (result.created) created++;
    }
    return created;
  }

  private storePositions(
    tx: Transaction,
    source: SourceRow,
    metadata: SourceMetadata,
    videoIds: readonly number[],
    stamp: string,
  ): void {
    const playlist = tx
      .select({ id: playlists.id })
      .from(playlists)
      .where(eq(playlists.youtubeId, source.youtubeId))
      .get();
    if (!playlist) return;
    // Only the fetched range is replaced; positions past it (a limited later check of a long
    // playlist) stay as the first check stored them.
    tx.delete(playlistItems)
      .where(
        and(
          eq(playlistItems.playlistId, playlist.id),
          sql`${playlistItems.position} <= ${Math.max(videoIds.length, 1)}`,
        ),
      )
      .run();
    for (const [index, videoId] of videoIds.entries()) {
      tx.insert(playlistItems)
        .values({ playlistId: playlist.id, position: index + 1, videoId })
        .onConflictDoUpdate({
          target: [playlistItems.playlistId, playlistItems.position],
          set: { videoId, trackId: null },
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

  private markChecked(sourceId: number, now: Date): void {
    const counted = this.db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(
        and(
          eq(videos.sourceId, sourceId),
          inArray(videos.status, ['wanted', 'downloading', 'on_disk']),
        ),
      )
      .get();
    this.db
      .update(sources)
      .set({
        lastCheckedAt: now.toISOString(),
        itemCount: counted?.count ?? 0,
        updatedAt: now.toISOString(),
      })
      .where(eq(sources.id, sourceId))
      .run();
  }
}

type Verdict = ReturnType<typeof evaluateItem>;
type VideoStatus = (typeof videos.$inferSelect)['status'];

/**
 * The status of a known video after a check. Items on disk, downloading or missing are never
 * changed by a check; `unavailable` (a removed video) waits for an explicit retry, and a file
 * deleted in Preview (`deleted_by_user`) is never downloaded again by a check.
 */
export function nextStatus(
  current: VideoStatus,
  skipReason: SkipReason | null,
  verdict: Verdict,
): { status: VideoStatus; skipReason: SkipReason | null } {
  if (current === 'on_disk' || current === 'downloading' || current === 'missing') {
    return { status: current, skipReason };
  }
  // A removed video waits for an explicit retry; a file the user deleted stays deleted.
  if (current === 'skipped' && (skipReason === 'unavailable' || skipReason === 'deleted_by_user')) {
    return { status: current, skipReason };
  }
  if (verdict.accept) return { status: 'wanted', skipReason: null };
  return { status: 'skipped', skipReason: verdict.reason };
}

function entryFields(entry: SourceEntry) {
  return {
    title: entry.title ?? entry.id,
    durationSeconds: entry.duration === null ? null : Math.round(entry.duration),
    publishedAt: entry.uploadDate,
    thumbnailUrl: bestThumbnail(entry),
    isShort: entry.isShort,
    liveStatus: entry.liveStatus,
  };
}

function bestThumbnail(entry: SourceEntry): string | null {
  let best: { url: string; area: number } | null = null;
  for (const thumbnail of entry.thumbnails) {
    const area = (thumbnail.width ?? 0) * (thumbnail.height ?? 0);
    if (!best || area > best.area) best = { url: thumbnail.url, area };
  }
  return best?.url ?? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`;
}
