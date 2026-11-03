import { Inject, Injectable } from '@nestjs/common';
import type { SubtitlesStatus, VideoSettings } from '@mytube/shared';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { channels, videos } from '../database/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { SettingsService } from '../settings/settings.service.js';

/** The `subtitle_languages` a job stores: the Settings languages in their order. */
export function languagesKey(video: Pick<VideoSettings, 'subtitleLanguages'>): string {
  return video.subtitleLanguages.join(',');
}

/** Priority of a subtitle job: the newest video first, as downloads are ordered. */
export function subtitlePriority(publishedAt: string | null): number {
  const time = publishedAt ? Date.parse(publishedAt) : Number.NaN;
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : 0;
}

/**
 * Queues `subtitles` jobs (backend skill "Subtitles"): one per video on disk, key
 * `video:<youtube id>`, payload `{ videoId, title, subtitle: channel, historyKind: 'video',
 * detail: 'subtitles' }`. The download runner queues one after each video; Settings → Video's
 * "Fetch subtitles" queues every video on disk whose last run was not with the current languages.
 */
@Injectable()
export class SubtitlesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
  ) {}

  /** Queues the subtitle job of one video; false when it is already queued or running. */
  enqueue(videoId: number): boolean {
    const row = this.row(videoId);
    if (!row) return false;
    return this.enqueueRow(row);
  }

  /**
   * Queues a subtitle job for every video on disk that never had one with the current
   * languages (none when no language is picked). Returns how many were queued.
   */
  enqueueMissing(): number {
    const video = this.settings.get().video;
    if (video.subtitleLanguages.length === 0) return 0;
    let queued = 0;
    for (const row of this.missingRows(languagesKey(video))) {
      if (this.enqueueRow(row)) queued += 1;
    }
    return queued;
  }

  status(): SubtitlesStatus {
    const video = this.settings.get().video;
    const missing =
      video.subtitleLanguages.length === 0 ? 0 : this.missingRows(languagesKey(video)).length;
    const queuedUntil = this.jobs.queuedUntil('subtitles');
    const pausedUntil =
      queuedUntil && Date.parse(queuedUntil) > Date.now() + 60_000 ? queuedUntil : null;
    return { missing, queued: this.jobs.activeCountOf('subtitles'), pausedUntil };
  }

  private enqueueRow(row: VideoRow): boolean {
    return this.jobs.enqueue({
      type: 'subtitles',
      key: `video:${row.youtubeId}`,
      priority: subtitlePriority(row.publishedAt),
      payload: {
        title: row.title,
        subtitle: row.channelName,
        historyKind: 'video',
        detail: 'subtitles',
        videoId: row.id,
      },
    }).created;
  }

  private row(videoId: number): VideoRow | undefined {
    return this.select().where(eq(videos.id, videoId)).get();
  }

  /** Videos on disk whose last subtitle run was not with `key` (or never ran). */
  private missingRows(key: string): VideoRow[] {
    return this.select()
      .where(
        and(
          eq(videos.status, 'on_disk'),
          or(isNull(videos.subtitlesAt), ne(videos.subtitleLanguages, key)),
        ),
      )
      .orderBy(sql`${videos.publishedAt} DESC`)
      .all();
  }

  private select() {
    return this.db
      .select({
        id: videos.id,
        youtubeId: videos.youtubeId,
        title: videos.title,
        publishedAt: videos.publishedAt,
        channelName: channels.name,
      })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId));
  }
}

interface VideoRow {
  id: number;
  youtubeId: string;
  title: string;
  publishedAt: string | null;
  channelName: string;
}
