import { existsSync } from 'node:fs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HOME_ITEM_LIMIT,
  artworkPath,
  videoMimeType,
  type HomeFeed,
  type HomeGroup,
  type HomeItem,
  type HomeQuery,
  type LibrarySummary,
  type VideoListItem,
  type VideoListQuery,
  type VideoPage,
} from '@mytube/shared';
import { type SQL, and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { HistoryService } from '../activity/history.service.js';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { channels, history, sources, tracks, videos } from '../database/schema.js';
import { OutsideLibraryError, libraryPath, removeMediaFiles } from '../files/media-files.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MusicLibraryService } from './music-library.service.js';

const DAY_MS = 86_400_000;

type VideoRow = typeof videos.$inferSelect;
type ChannelRow = typeof channels.$inferSelect;

/** A file Preview streams. */
export interface VideoStream {
  path: string;
  contentType: string | null;
}

/**
 * The library read models over `videos` and `channels`: the videos list, the Home feed (with the
 * music items from `MusicLibraryService`) and stats, the header summaries, and the two file
 * actions of Preview (stream and delete).
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger('Library');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: AppConfig,
    private readonly jobs: JobsService,
    private readonly historyService: HistoryService,
    private readonly music: MusicLibraryService,
  ) {}

  /**
   * Videos, newest first by upload date (`published`) or download time (`downloaded`), with
   * keyset pagination: `nextCursor` encodes the last row's sort value and id.
   */
  listVideos(query: VideoListQuery): VideoPage {
    const sortColumn = query.sort === 'downloaded' ? videos.downloadedAt : videos.publishedAt;
    // Rows without the value sort last (the empty string is below every date).
    const sortValue = sql<string>`coalesce(${sortColumn}, '')`;
    const conditions: (SQL | undefined)[] = [
      query.status === 'all' ? undefined : eq(videos.status, query.status),
      query.channelId === undefined ? undefined : eq(videos.channelId, query.channelId),
      // A source's videos: the ones it listed first, and every video of its channel.
      query.sourceId === undefined
        ? undefined
        : or(eq(videos.sourceId, query.sourceId), eq(channels.sourceId, query.sourceId)),
    ];
    if (query.cursor !== undefined) {
      const [value, id] = decodeCursor(query.cursor);
      conditions.push(
        sql`(${sortValue} < ${value} OR (${sortValue} = ${value} AND ${videos.id} < ${id}))`,
      );
    }
    const rows = this.db
      .select({ video: videos, channel: channels, sortValue })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(and(...conditions))
      .orderBy(desc(sortValue), desc(videos.id))
      .limit(query.limit + 1)
      .all();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => toListItem(row.video, row.channel)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(last.sortValue, last.video.id) : null,
    };
  }

  /** One video with its channel; 404 when unknown. */
  getVideo(id: number): VideoListItem {
    const row = this.videoRow(id);
    return toListItem(row.video, row.channel);
  }

  /**
   * What landed in the last `days` days, grouped by the local day (in `tz`, else the server's
   * zone) of `downloaded_at`, newest first, at most `HOME_ITEM_LIMIT` items; plus the stats.
   */
  home(query: HomeQuery, now = new Date()): HomeFeed {
    const since = new Date(now.getTime() - query.days * DAY_MS).toISOString();
    const rows = this.db
      .select({ video: videos, channel: channels })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(and(eq(videos.status, 'on_disk'), gte(videos.downloadedAt, since)))
      .orderBy(desc(videos.downloadedAt), desc(videos.id))
      .limit(HOME_ITEM_LIMIT)
      .all();
    const items: HomeItem[] = [
      ...rows.map(({ video, channel }): HomeItem => ({
        kind: 'video',
        ...toListItem(video, channel),
      })),
      ...this.music
        .recentTracks(since, HOME_ITEM_LIMIT)
        .map((track): HomeItem => ({ kind: 'music', ...track })),
    ];
    // Both lists are newest first; merge them by download time.
    items.sort((a, b) => (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? '') || b.id - a.id);
    const dayOf = localDay(query.tz);
    const groups: HomeGroup[] = [];
    for (const item of items.slice(0, HOME_ITEM_LIMIT)) {
      const day = dayOf(new Date(item.downloadedAt!));
      let group = groups.at(-1);
      if (!group || group.day !== day) {
        group = { day, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return { stats: this.stats(), groups };
  }

  /** The Home stat cards: active downloads, finished downloads ever, bytes on disk. */
  stats(): HomeFeed['stats'] {
    const downloaded =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(history)
        .where(and(eq(history.result, 'done'), inArray(history.kind, ['video', 'music'])))
        .get()?.count ?? 0;
    return {
      activeDownloads: this.jobs.summary().activeDownloads,
      downloadedAllTime: downloaded,
      librarySizeBytes: this.onDiskBytes(videos) + this.onDiskBytes(tracks),
    };
  }

  /**
   * The header subs: for Video the channel and playlist sources, videos on disk and their size;
   * for Music the artists, albums and playlists of its tabs and the subscribed artists.
   */
  summary(): LibrarySummary {
    const kinds = this.db
      .select({ kind: sources.kind, count: sql<number>`count(*)` })
      .from(sources)
      .where(eq(sources.library, 'video'))
      .groupBy(sources.kind)
      .all();
    const count = (kind: string) => kinds.find((row) => row.kind === kind)?.count ?? 0;
    const onDisk = this.db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(eq(videos.status, 'on_disk'))
      .get();
    return {
      videos: {
        channels: count('channel'),
        playlists: count('playlist'),
        videos: onDisk?.count ?? 0,
        sizeBytes: this.onDiskBytes(videos),
      },
      music: this.music.summary(),
    };
  }

  /** The file of an on-disk video for Preview. 404 when there is none; 403 outside the mount. */
  streamTarget(id: number): VideoStream {
    const { video } = this.videoRow(id);
    if (video.status !== 'on_disk' || !video.filePath) {
      throw new NotFoundException(`Video ${id} is not on disk`);
    }
    const path = this.insideVideoDir(video.filePath);
    if (!existsSync(path)) throw new NotFoundException(`The file of video ${id} is missing`);
    return { path, contentType: videoMimeType(video.filePath) };
  }

  /**
   * Delete file in Preview, the explicit deletion: removes the media file and its sidecars
   * (and folders left empty), marks the video `skipped` / `deleted_by_user` so nothing
   * downloads it again, takes its size off its source and records a `removed` history row.
   * 404 for an unknown video, 409 when it is not on disk.
   */
  deleteFile(id: number): void {
    const { video } = this.videoRow(id);
    if (video.status !== 'on_disk' || !video.filePath) {
      throw new ConflictException(`Video ${id} is not on disk`);
    }
    this.insideVideoDir(video.filePath);
    const removed = removeMediaFiles(this.config.videoDir, video.filePath);
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.update(videos)
        .set({
          status: 'skipped',
          skipReason: 'deleted_by_user',
          filePath: null,
          fileSizeBytes: null,
          updatedAt: now,
        })
        .where(eq(videos.id, video.id))
        .run();
      if (video.sourceId !== null) {
        const counted = tx
          .select({ count: sql<number>`count(*)` })
          .from(videos)
          .where(
            and(
              eq(videos.sourceId, video.sourceId),
              inArray(videos.status, ['wanted', 'downloading', 'on_disk']),
            ),
          )
          .get();
        tx.update(sources)
          .set({
            sizeBytes: sql`max(0, ${sources.sizeBytes} - ${video.fileSizeBytes ?? 0})`,
            itemCount: counted?.count ?? 0,
            updatedAt: now,
          })
          .where(eq(sources.id, video.sourceId))
          .run();
      }
    });
    this.historyService.record({
      kind: 'video',
      title: video.title,
      result: 'removed',
      details: 'deleted by user',
    });
    this.logger.log(`Deleted ${removed.join(', ')} (video ${video.id}, by the user)`);
  }

  private videoRow(id: number): { video: VideoRow; channel: ChannelRow } {
    const row = this.db
      .select({ video: videos, channel: channels })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(eq(videos.id, id))
      .get();
    if (!row) throw new NotFoundException(`Video ${id} not found`);
    return row;
  }

  private insideVideoDir(filePath: string): string {
    try {
      return libraryPath(this.config.videoDir, filePath);
    } catch (error) {
      if (error instanceof OutsideLibraryError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  private onDiskBytes(table: typeof videos | typeof tracks): number {
    return (
      this.db
        .select({ total: sql<number>`coalesce(sum(${table.fileSizeBytes}), 0)` })
        .from(table)
        .where(eq(table.status, 'on_disk'))
        .get()?.total ?? 0
    );
  }
}

/** A `videos` row and its channel as the list DTO, with artwork pointing at the cache. */
export function toListItem(video: VideoRow, channel: ChannelRow): VideoListItem {
  const onDisk = video.status === 'on_disk' && video.filePath !== null;
  return {
    ...video,
    thumbnailUrl: video.thumbnailUrl !== null || onDisk ? artworkPath('video', video.id) : null,
    mimeType: onDisk ? videoMimeType(video.filePath!) : null,
    channel: {
      id: channel.id,
      name: channel.name,
      avatarUrl: channel.avatarUrl === null ? null : artworkPath('channel', channel.id),
      sourceId: channel.sourceId,
    },
  };
}

/** `YYYY-MM-DD` of an instant in `timeZone` (the server's zone when undefined). */
export function localDay(timeZone: string | undefined): (date: Date) => string {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (date) => {
    const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

export function encodeCursor(value: string, id: number): string {
  return Buffer.from(JSON.stringify([value, id])).toString('base64url');
}

export function decodeCursor(cursor: string): [string, number] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [value, id]: unknown[] = parsed;
      if (typeof value === 'string' && typeof id === 'number' && Number.isInteger(id)) {
        return [value, id];
      }
    }
  } catch {
    // Falls through to the 400.
  }
  throw new BadRequestException('Invalid cursor');
}
