import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  evaluateMatcher,
  type HistoryKind,
  type ItemStatus,
  type Matcher,
  type MatcherContext,
  type RulesPreview,
  type SkipReason,
} from '@mytube/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { HistoryService } from '../activity/history.service.js';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  artists,
  channels,
  playlistItems,
  playlists,
  sources,
  tracks,
  videos,
} from '../database/schema.js';
import { removeMediaFiles } from '../files/media-files.js';
import type { JobRow } from '../jobs/job-runner.js';
import { JobsService } from '../jobs/jobs.service.js';
import { wantedElsewhere } from './claims.js';
import { SourceGoneError, SyncService } from './sync.service.js';

/** How often each subscribed source's files are compared with its rules. */
export const REVALIDATE_INTERVAL_MS = 6 * 3_600_000;

type SourceRow = typeof sources.$inferSelect;

/** One video or track of a source, as the matcher sees it. */
interface Item {
  table: 'videos' | 'tracks';
  id: number;
  title: string;
  status: ItemStatus;
  skipReason: SkipReason | null;
  filePath: string | null;
  fileSizeBytes: number | null;
  ctx: MatcherContext;
}

interface Plan {
  /** On disk, and the rules no longer match: the file goes. */
  remove: { item: Item; failing: string[] }[];
  /** On disk and still matching. */
  keep: number;
  /** Wanted (not downloaded yet) and no longer matching: skipped, its queued download no-ops. */
  unwant: Item[];
  /** Skipped by the rules, and they match again: wanted, a download is queued. */
  rewant: Item[];
}

export interface RevalidationResult {
  removed: number;
  kept: number;
  unwanted: number;
  rewanted: number;
  /** Files that matched no longer but could not be deleted (they stay on disk). */
  failed: number;
}

export interface RevalidationContext {
  /** The `revalidate` job, linked from the history rows it writes. */
  jobId?: number;
  log?: (line: string) => void;
  signal?: AbortSignal;
}

/**
 * Revalidation: re-evaluates a source's known items against its current rules. This is the only
 * automatic deletion (it replaces the old "retention" job: "keep the last 90 days" is the rule
 * `not(older_than_days 90)`).
 *
 * - An item on disk the rules no longer match loses its file (media, thumbnail and subtitle
 *   sidecars, then empty folders), becomes `skipped` / `no_longer_matches` with `file_path`
 *   cleared, its size leaves `sources.size_bytes`, and history gets a `removed` row whose
 *   details name the failing conditions (`no longer matches: not older than 90 days`).
 * - A `wanted` item that no longer matches becomes `skipped` / `no_match`.
 * - An item skipped by the rules (`no_match`, `no_longer_matches`) that matches again becomes
 *   `wanted` and its download is queued.
 * - Items that are downloading, missing or `unavailable` are left alone, and so is every item
 *   of another source (items belong to the source that first listed them, `source_id`).
 * - An item another source still wants (a playlist listing it, or the source that owns it,
 *   whose tree matches) is neither removed nor unwanted: a match wins (`wantedElsewhere`).
 *
 * `preview` runs the same evaluation against a candidate tree without touching anything.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger('Revalidation');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
    private readonly history: HistoryService,
    private readonly jobs: JobsService,
    private readonly sync: SyncService,
  ) {}

  /** What saving `matcher` would remove from the source's files on disk. 404 for no source. */
  preview(sourceId: number, matcher: Matcher, now = new Date()): RulesPreview {
    const source = this.db.select().from(sources).where(eq(sources.id, sourceId)).get();
    if (!source) throw new NotFoundException(`Source ${sourceId} not found`);
    const plan = this.plan(source, matcher, now);
    return {
      wouldRemove: plan.remove.map(({ item, failing }) => ({
        id: item.id,
        title: item.title,
        failing,
      })),
      wouldKeep: plan.keep,
    };
  }

  /** Applies the source's current rules to its items (see the class comment). */
  revalidate(sourceId: number, ctx: RevalidationContext = {}): RevalidationResult {
    const source = this.db.select().from(sources).where(eq(sources.id, sourceId)).get();
    if (!source) throw new SourceGoneError(`Source ${sourceId} no longer exists`);
    const now = new Date();
    const plan = this.plan(source, source.matcher, now);
    const root = source.library === 'music' ? this.config.musicDir : this.config.videoDir;
    const kind: HistoryKind = source.library === 'music' ? 'music' : 'video';
    const log = ctx.log ?? (() => undefined);
    const result: RevalidationResult = {
      removed: 0,
      kept: plan.keep,
      unwanted: plan.unwant.length,
      rewanted: plan.rewant.length,
      failed: 0,
    };

    for (const { item, failing } of plan.remove) {
      ctx.signal?.throwIfAborted();
      const reason = `no longer matches: ${failing.join(', ')}`;
      try {
        if (item.filePath) {
          const names = removeMediaFiles(root, item.filePath);
          log(`removed ${item.filePath} (${names.join(', ')}): ${reason}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`could not remove ${item.filePath ?? item.title}: ${message}`);
        this.logger.warn(`Could not remove ${item.filePath ?? item.title}: ${message}`);
        this.history.record({
          kind,
          title: item.title,
          result: 'failed',
          details: `Could not remove the file (${reason}): ${message}`,
          jobId: ctx.jobId,
        });
        result.failed++;
        continue;
      }
      const stamp = new Date().toISOString();
      this.db.transaction((tx) => {
        const table = item.table === 'videos' ? videos : tracks;
        tx.update(table)
          .set({
            status: 'skipped',
            skipReason: 'no_longer_matches',
            filePath: null,
            fileSizeBytes: null,
            updatedAt: stamp,
          })
          .where(eq(table.id, item.id))
          .run();
        tx.update(sources)
          .set({
            sizeBytes: sql`max(0, ${sources.sizeBytes} - ${item.fileSizeBytes ?? 0})`,
            updatedAt: stamp,
          })
          .where(eq(sources.id, source.id))
          .run();
      });
      this.history.record({
        kind,
        title: item.title,
        result: 'removed',
        details: reason,
        jobId: ctx.jobId,
      });
      result.removed++;
    }

    const stamp = now.toISOString();
    for (const item of plan.unwant) {
      const table = item.table === 'videos' ? videos : tracks;
      this.db
        .update(table)
        .set({ status: 'skipped', skipReason: 'no_match', updatedAt: stamp })
        .where(and(eq(table.id, item.id), eq(table.status, 'wanted')))
        .run();
    }
    for (const item of plan.rewant) {
      const table = item.table === 'videos' ? videos : tracks;
      this.db
        .update(table)
        .set({ status: 'wanted', skipReason: null, updatedAt: stamp })
        .where(and(eq(table.id, item.id), eq(table.status, 'skipped')))
        .run();
    }
    const rewantedVideos = plan.rewant.filter((item) => item.table === 'videos');
    if (rewantedVideos.length > 0) {
      this.sync.enqueueDownloads(
        source,
        rewantedVideos.map((item) => item.id),
      );
    }
    const rewantedTracks = plan.rewant.filter((item) => item.table === 'tracks');
    if (rewantedTracks.length > 0) {
      this.sync.music.enqueueDownloads(
        source,
        rewantedTracks.map((item) => item.id),
      );
    }

    this.db
      .update(sources)
      .set({ lastRevalidatedAt: stamp, itemCount: this.countItems(source), updatedAt: stamp })
      .where(eq(sources.id, source.id))
      .run();
    const summary = `${result.removed} removed, ${result.kept} kept, ${result.unwanted} no longer wanted, ${result.rewanted} wanted again, ${result.failed} failed`;
    log(`Revalidated ${source.name}: ${summary}`);
    if (result.removed + result.unwanted + result.rewanted + result.failed > 0) {
      this.logger.log(`Revalidated ${source.name}: ${summary}`);
    }
    return result;
  }

  /**
   * Enqueues a `revalidate` job for the source (key `source:<id>`, so a queued or running one is
   * reused). Undefined when the source does not exist.
   */
  enqueue(sourceId: number): { job: JobRow; created: boolean } | undefined {
    const source = this.db.select().from(sources).where(eq(sources.id, sourceId)).get();
    if (!source) return undefined;
    return this.jobs.enqueue({
      type: 'revalidate',
      key: `source:${source.id}`,
      payload: {
        title: source.name,
        subtitle: 'checking files against the rules',
        historyKind: source.library,
        sourceId: source.id,
      },
    });
  }

  /**
   * Subscribed sources due for revalidation at `now`: never revalidated, or last revalidated
   * `REVALIDATE_INTERVAL_MS` or more ago, and no revalidation that failed for good within the
   * interval. Unsubscribed sources are paused: nothing is downloaded or removed on a schedule
   * (saving their rules still revalidates them once).
   */
  dueSources(now: Date): SourceRow[] {
    const cutoff = now.getTime() - REVALIDATE_INTERVAL_MS;
    return this.db
      .select()
      .from(sources)
      .where(eq(sources.subscribed, true))
      .all()
      .filter((source) => {
        if (source.lastRevalidatedAt !== null && Date.parse(source.lastRevalidatedAt) > cutoff) {
          return false;
        }
        const last = this.jobs.latestForKey('revalidate', `source:${source.id}`);
        return !(
          last?.status === 'failed' &&
          last.finishedAt &&
          Date.parse(last.finishedAt) > cutoff
        );
      });
  }

  private plan(source: SourceRow, matcher: Matcher, now: Date): Plan {
    const plan: Plan = { remove: [], keep: 0, unwant: [], rewant: [] };
    // Another source that lists the item and still matches it keeps it (a match wins).
    const elsewhere = (item: Item) =>
      wantedElsewhere(this.db, item.table, item.id, source.id, {
        ...item.ctx,
        playlistPosition: null,
      });
    for (const item of this.items(source, now)) {
      if (item.status === 'on_disk') {
        const result = evaluateMatcher(matcher, item.ctx);
        if (result.matches || elsewhere(item)) plan.keep++;
        else plan.remove.push({ item, failing: result.failing ?? [] });
      } else if (item.status === 'wanted') {
        if (!evaluateMatcher(matcher, item.ctx).matches && !elsewhere(item)) plan.unwant.push(item);
      } else if (
        item.status === 'skipped' &&
        (item.skipReason === 'no_match' || item.skipReason === 'no_longer_matches')
      ) {
        if (evaluateMatcher(matcher, item.ctx).matches) plan.rewant.push(item);
      }
    }
    return plan;
  }

  /** The source's videos (video library) or tracks (music library), oldest id first. */
  private items(source: SourceRow, now: Date): Item[] {
    const positions = this.positions(source);
    if (source.library === 'music') {
      return this.db
        .select({ track: tracks, artistName: artists.name, artistId: artists.youtubeId })
        .from(tracks)
        .innerJoin(artists, eq(artists.id, tracks.artistId))
        .where(eq(tracks.sourceId, source.id))
        .orderBy(tracks.id)
        .all()
        .map(({ track, artistName, artistId }) => ({
          table: 'tracks' as const,
          id: track.id,
          title: track.title,
          status: track.status,
          skipReason: track.skipReason,
          filePath: track.filePath,
          fileSizeBytes: track.fileSizeBytes,
          ctx: {
            title: track.title,
            isShort: false,
            publishedAt: track.publishedAt,
            durationSeconds: track.durationSeconds,
            liveStatus: null,
            channelName: artistName,
            channelId: artistId,
            playlistPosition: positions.get(track.id) ?? null,
            now,
          },
        }));
    }

    return this.db
      .select({ video: videos, channelName: channels.name, channelId: channels.youtubeId })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(eq(videos.sourceId, source.id))
      .orderBy(videos.id)
      .all()
      .map(({ video, channelName, channelId }) => ({
        table: 'videos' as const,
        id: video.id,
        title: video.title,
        status: video.status,
        skipReason: video.skipReason,
        filePath: video.filePath,
        fileSizeBytes: video.fileSizeBytes,
        ctx: {
          title: video.title,
          isShort: video.isShort,
          publishedAt: video.publishedAt,
          durationSeconds: video.durationSeconds,
          liveStatus: video.liveStatus,
          channelName,
          channelId,
          playlistPosition: positions.get(video.id) ?? null,
          now,
        },
      }));
  }

  /**
   * For a playlist source, its items' positions (`videos.id` or `tracks.id` → position, the
   * first when listed twice); empty for channels and artists.
   */
  private positions(source: SourceRow): Map<number, number> {
    const positions = new Map<number, number>();
    if (source.kind !== 'playlist') return positions;
    const rows = this.db
      .select({
        videoId: playlistItems.videoId,
        trackId: playlistItems.trackId,
        position: playlistItems.position,
      })
      .from(playlistItems)
      .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
      .where(eq(playlists.youtubeId, source.youtubeId))
      .orderBy(playlistItems.position)
      .all();
    for (const row of rows) {
      const id = source.library === 'music' ? row.trackId : row.videoId;
      if (id !== null && !positions.has(id)) positions.set(id, row.position);
    }
    return positions;
  }

  private countItems(source: SourceRow): number {
    const table = source.library === 'music' ? tracks : videos;
    return (
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(
          and(
            eq(table.sourceId, source.id),
            inArray(table.status, ['wanted', 'downloading', 'on_disk']),
          ),
        )
        .get()?.count ?? 0
    );
  }
}
