import { mkdirSync, readdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { renderPathTemplate } from '@mytube/shared';
import { eq, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { channels, sources, videos } from '../database/schema.js';
import { JobLogsService } from '../jobs/job-logs.service.js';
import {
  PermanentJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from '../jobs/job-runner.js';
import { SettingsService } from '../settings/settings.service.js';
import { networkOptions } from '../ytdlp/network.js';
import { YtdlpError } from '../ytdlp/ytdlp-error.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import {
  DownloadProgressTracker,
  isUnavailableReason,
  videoExtraArgs,
  videoFormat,
} from './video-options.js';

/** Media containers a finished download can have; a name with one of these is not a partial. */
const MEDIA_EXTENSIONS = new Set(['mkv', 'mp4', 'webm', 'm4a', 'mp3', 'opus', 'flac', 'mov']);

/**
 * `download` jobs for videos (payload `{ videoId, title, subtitle, historyKind, playlist? }`).
 *
 * 1. Loads the video and its channel; marks it `downloading`.
 * 2. Reads the video's full metadata (exact upload date and title: flat listings only carry an
 *    approximate date) and renders `video.pathTemplate` under `VIDEO_DIR`.
 * 3. Runs yt-dlp with the Settings → Video format, container, subtitles and thumbnail options
 *    and the network options, reporting progress.
 * 4. On success marks the video `on_disk` with its path (relative to `VIDEO_DIR`), size and
 *    time, and adds the size to its source.
 *
 * A failure puts the video back to `wanted` and rethrows (the worker retries). A video YouTube
 * refuses for good (removed, private, members-only) becomes `skipped` / `unavailable` and fails
 * the job at once. A cancel kills yt-dlp and removes partial files; a shutdown keeps them so the
 * next run resumes. Every yt-dlp run is logged to the job log.
 */
@Injectable()
export class DownloadRunner implements JobRunner {
  readonly type = 'download';
  private readonly logger = new Logger('DownloadRunner');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
    private readonly logs: JobLogsService,
  ) {}

  async run(job: JobRow, { signal, progress }: JobContext): Promise<JobOutcome | null> {
    const videoId = job.payload.videoId;
    if (typeof videoId !== 'number') throw new PermanentJobError('Job has no videoId');
    const row = this.db
      .select({ video: videos, channelName: channels.name })
      .from(videos)
      .innerJoin(channels, eq(channels.id, videos.channelId))
      .where(eq(videos.id, videoId))
      .get();
    if (!row) throw new PermanentJobError(`Video ${videoId} is no longer known`);
    const { video, channelName } = row;

    // Nothing to do: already downloaded, or not wanted any more. Only a retry of an
    // `unavailable` video tries again.
    if (
      video.status === 'on_disk' ||
      video.status === 'missing' ||
      (video.status === 'skipped' && video.skipReason !== 'unavailable')
    ) {
      return null;
    }

    const log = this.logs.open(job);
    const settings = this.settings.get();
    const network = networkOptions(settings.network);
    const url = `https://www.youtube.com/watch?v=${video.youtubeId}`;
    this.setStatus(video.id, 'downloading');
    let target: string | null = null;
    try {
      const info = await this.runner.metadata(url, { network, signal, log: log.line });
      const entry = info.entries.find((item) => item.id === video.youtubeId) ?? info.entries[0];
      const title = entry?.title ?? video.title;
      const date = entry?.uploadDate ?? video.publishedAt?.slice(0, 10) ?? null;
      this.db
        .update(videos)
        .set({
          title,
          publishedAt: date ?? video.publishedAt,
          durationSeconds:
            entry?.duration == null ? video.durationSeconds : Math.round(entry.duration),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(videos.id, video.id))
        .run();

      const playlist = job.payload.playlist;
      const path = renderPathTemplate(settings.video.pathTemplate, {
        channel: channelName,
        title,
        date,
        year: date?.slice(0, 4),
        id: video.youtubeId,
        playlist: typeof playlist === 'string' ? playlist : null,
      });
      target = insideLibrary(this.config.videoDir, path);
      mkdirSync(dirname(target), { recursive: true });
      log.line(`target ${target}.<ext>`);

      const tracker = new DownloadProgressTracker();
      const result = await this.runner.download(
        url,
        {
          // `%` starts a yt-dlp output template field; the rendered path is literal.
          output: `${target.replaceAll('%', '%%')}.%(ext)s`,
          format: videoFormat(settings.video.quality, settings.video.container),
          mergeOutputFormat: settings.video.container,
          extraArgs: videoExtraArgs(settings.video),
          network,
          signal,
          log: log.line,
        },
        (update) => {
          const report = tracker.update(update);
          if (report) progress(report);
        },
      );

      const size = statSync(result.filePath).size;
      const filePath = relative(this.config.videoDir, result.filePath).split(sep).join('/');
      const now = new Date().toISOString();
      this.db.transaction((tx) => {
        tx.update(videos)
          .set({
            status: 'on_disk',
            skipReason: null,
            filePath,
            fileSizeBytes: size,
            downloadedAt: now,
            updatedAt: now,
          })
          .where(eq(videos.id, video.id))
          .run();
        if (video.sourceId !== null) {
          tx.update(sources)
            .set({ sizeBytes: sql`${sources.sizeBytes} + ${size}`, updatedAt: now })
            .where(eq(sources.id, video.sourceId))
            .run();
        }
      });
      log.line(`saved ${filePath} (${size} bytes)`);
      return { title, result: 'done', kind: 'video', details: filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.line(`failed: ${message}`);
      if (signal.aborted) {
        this.setStatus(video.id, 'wanted');
        // A shutdown keeps the partial files so the next run resumes them.
        if (signal.reason !== 'shutdown' && target) this.removePartials(target, log.line);
        throw error;
      }
      const reason = error instanceof YtdlpError ? error.reason : null;
      if (isUnavailableReason(reason)) {
        this.db
          .update(videos)
          .set({
            status: 'skipped',
            skipReason: 'unavailable',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(videos.id, video.id))
          .run();
        throw new PermanentJobError(reason ?? message);
      }
      this.setStatus(video.id, 'wanted');
      throw error;
    } finally {
      log.close();
      this.logs.prune();
    }
  }

  private setStatus(id: number, status: 'wanted' | 'downloading'): void {
    this.db
      .update(videos)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(videos.id, id))
      .run();
  }

  /**
   * Removes what a cancelled download left next to `target` (the path without extension):
   * `.part` and `.ytdl` files, fragments and unmerged format files, and, when no finished media
   * file with that name exists, its thumbnail and subtitle sidecars. Then the folder, if empty.
   */
  private removePartials(target: string, log: (line: string) => void): void {
    const dir = dirname(target);
    const prefix = `${basename(target)}.`;
    let names: string[];
    try {
      names = readdirSync(dir).filter((name) => name.startsWith(prefix));
    } catch {
      return;
    }
    const rest = (name: string) => name.slice(prefix.length);
    const isPartial = (name: string) =>
      /\.(part|ytdl)$|\.part-Frag\d+|^f\d+\.|\.temp\.|^temp\./.test(rest(name));
    const finished = names.some((name) => !isPartial(name) && MEDIA_EXTENSIONS.has(rest(name)));
    for (const name of names) {
      if (isPartial(name) || !finished) {
        rmSync(join(dir, name), { force: true });
        log(`removed ${name}`);
      }
    }
    try {
      if (readdirSync(dir).length === 0 && resolve(dir) !== resolve(this.config.videoDir)) {
        rmdirSync(dir);
      }
    } catch (error) {
      this.logger.debug(`Could not remove ${dir}: ${String(error)}`);
    }
  }
}

/**
 * `root/relativePath` as an absolute path, refusing anything that would land outside `root`.
 * `renderPathTemplate` already guarantees this; this is the second lock on the door.
 */
export function insideLibrary(root: string, relativePath: string): string {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (!target.startsWith(base + sep)) {
    throw new PermanentJobError(`Refusing to write outside the library: ${relativePath}`);
  }
  return target;
}
