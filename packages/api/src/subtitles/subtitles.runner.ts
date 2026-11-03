import { existsSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { sources, videos } from '../database/schema.js';
import { subtitleLanguages } from '../downloads/video-options.js';
import { isUnavailableReason } from '../downloads/video-options.js';
import { libraryPath } from '../files/media-files.js';
import { JobLogsService } from '../jobs/job-logs.service.js';
import {
  PermanentJobError,
  PostponeJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from '../jobs/job-runner.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PlaybackService } from '../library/playback.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { networkOptions } from '../ytdlp/network.js';
import { isYtdlpFailure, YtdlpError } from '../ytdlp/ytdlp-error.js';
import { YtdlpRunner, YtdlpSession } from '../ytdlp/ytdlp-runner.js';
import { isRateLimit, nextFetchAt, SubtitleBackoff } from './backoff.js';
import { SubtitleEmbedder } from './embed.js';
import {
  listSidecars,
  missingLanguages,
  presentLanguages,
  renameOrigSidecars,
} from './sidecars.js';
import { languagesKey } from './subtitles.service.js';

/**
 * `subtitles` jobs (payload `{ videoId, … }`): the captions of a video that is on disk, fetched
 * after its download (backend skill "Subtitles").
 *
 * 1. Loads the video; nothing to do unless it is `on_disk` and the file exists. With no
 *    languages in Settings the run is recorded and that is all.
 * 2. Looks at what the file already has: subtitle sidecars next to it and the embedded text
 *    streams (ffprobe, `PlaybackService.probe`). Languages covered are not fetched again, so
 *    "Fetch subtitles" over the whole library only touches YouTube for what is missing.
 * 3. Reads the video's metadata and narrows the missing languages to the tracks the video has
 *    (`subtitleLanguages`: uploaded, else the spoken language's `-orig` captions); nothing
 *    left means the video has no such subtitles on YouTube (`no subtitles` in history).
 * 4. Fetches them (`runner.subtitles`, `--skip-download --write-subs`) as sidecars, drops the
 *    `-orig` suffix, and with "embedded" muxes them into the file (`SubtitleEmbedder`) and
 *    removes the sidecars; the file's size is updated.
 * 5. Records the run on the video (`subtitles_at`, `subtitle_languages`).
 *
 * Throttling: after every fetch the queued subtitle jobs wait `SUBTITLE_SPACING_MS`. YouTube's
 * HTTP 429 on a caption track (`isRateLimit`) postpones this job and every queued one for the
 * backoff's pause (`SubtitleBackoff`: 15 min, 30 min, 1 h, …), without counting an attempt.
 * Other failures retry as usual; a video that is gone for good fails at once.
 */
@Injectable()
export class SubtitlesRunner implements JobRunner {
  readonly type = 'subtitles';
  private readonly logger = new Logger('SubtitlesRunner');
  readonly backoff = new SubtitleBackoff();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
    private readonly logs: JobLogsService,
    private readonly jobs: JobsService,
    private readonly playback: PlaybackService,
    private readonly embedder: SubtitleEmbedder,
  ) {}

  async run(job: JobRow, { signal }: JobContext): Promise<JobOutcome | null> {
    const videoId = job.payload.videoId;
    if (typeof videoId !== 'number') throw new PermanentJobError('Job has no videoId');
    const video = this.db.select().from(videos).where(eq(videos.id, videoId)).get();
    if (!video) throw new PermanentJobError(`Video ${videoId} is no longer known`);
    if (video.status !== 'on_disk' || !video.filePath) return null;
    const file = libraryPath(this.config.videoDir, video.filePath);
    if (!existsSync(file)) return null;

    const settings = this.settings.get();
    const wanted = settings.video.subtitleLanguages;
    const key = languagesKey(settings.video);
    const log = this.logs.open(job);
    let fetched = false;
    try {
      if (wanted.length === 0) {
        log.line('subtitles: no languages in Settings');
        this.markDone(video.id, key);
        return null;
      }
      const sidecarsBefore = listSidecars(file);
      const probe = await this.playback.probe(file);
      const present = presentLanguages(sidecarsBefore, probe?.subtitles ?? []);
      const missing = missingLanguages(wanted, present);
      if (present.length > 0) log.line(`subtitles: the file has ${present.join(', ')}`);
      if (missing.length === 0) {
        log.line('subtitles: nothing to fetch');
        this.markDone(video.id, key);
        return null;
      }

      const url = `https://www.youtube.com/watch?v=${video.youtubeId}`;
      const network = networkOptions(settings.network);
      const session = new YtdlpSession();
      const info = await this.runner.metadata(url, { network, session, signal, log: log.line });
      const entry = info.entries.find((item) => item.id === video.youtubeId) ?? info.entries[0];
      const { languages, skipped } = subtitleLanguages(
        { subtitleLanguages: missing, autoSubtitles: settings.video.autoSubtitles },
        entry?.captions,
      );
      if (skipped.length > 0) {
        log.line(
          `subtitles: no ${skipped.join(', ')} (on YouTube only as a dub's transcript or a machine translation)`,
        );
      }
      if (languages.length === 0) {
        this.markDone(video.id, key);
        return {
          kind: 'video',
          title: video.title,
          result: 'no subtitles',
          details: `no ${missing.join(', ')} subtitles on YouTube`,
        };
      }
      log.line(`subtitles: fetching ${languages.join(', ')}`);

      const stem = join(dirname(file), basename(file, extname(file)));
      fetched = true;
      try {
        await this.runner.subtitles(url, {
          // `%` starts a yt-dlp output template field; the path is literal.
          output: `${stem.replaceAll('%', '%%')}.%(ext)s`,
          languages,
          generated: settings.video.autoSubtitles,
          network,
          session,
          signal,
          log: log.line,
        });
      } catch (error) {
        if (isYtdlpFailure(error, 'subtitles') && isRateLimit(error.reason) && !signal.aborted) {
          const until = this.backoff.rateLimited(new Date());
          const reason = error.reason ?? error.message;
          log.line(`rate limited: ${reason}; subtitles paused until ${until.toISOString()}`);
          this.logger.warn(
            `YouTube rate-limited captions (${this.backoff.count} in a row); subtitle jobs wait until ${until.toISOString()}`,
          );
          this.jobs.delayQueued('subtitles', until);
          throw new PostponeJobError(until, reason);
        }
        throw error;
      }
      this.backoff.succeeded();

      renameOrigSidecars(file, log.line);
      const before = new Set(sidecarsBefore.map((sidecar) => sidecar.file));
      const written = listSidecars(file).filter((sidecar) => !before.has(sidecar.file));
      if (written.length === 0) {
        log.line('subtitles: yt-dlp wrote no subtitle file');
        this.markDone(video.id, key);
        return {
          kind: 'video',
          title: video.title,
          result: 'no subtitles',
          details: `yt-dlp wrote no ${languages.join(', ')} subtitles`,
        };
      }
      const names = written.map((sidecar) => sidecar.file);
      log.line(`subtitles: wrote ${names.join(', ')}`);

      let how = 'as sidecar files';
      if (settings.video.subtitlesEmbedded) {
        const dir = dirname(file);
        await this.embedder.embed(
          file,
          written.map((sidecar) => ({ file: join(dir, sidecar.file), lang: sidecar.lang })),
          probe?.subtitles.length ?? 0,
          { signal, log: log.line },
        );
        for (const name of names) rmSync(join(dir, name), { force: true });
        this.storeSize(video, statSync(file).size);
        log.line(`subtitles: embedded ${written.map((sidecar) => sidecar.lang).join(', ')}`);
        how = 'embedded';
      }
      this.markDone(video.id, key);
      return {
        kind: 'video',
        title: video.title,
        result: 'subtitles',
        details: `${written.map((sidecar) => sidecar.lang).join(', ')} ${how}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof PostponeJobError)) log.line(`failed: ${message}`);
      const reason = error instanceof YtdlpError ? error.reason : null;
      if (!signal.aborted && isUnavailableReason(reason)) {
        this.markDone(video.id, key);
        throw new PermanentJobError(reason ?? message);
      }
      throw error;
    } finally {
      // The gap between fetches, whatever the outcome; a 429 already set a longer wait.
      if (fetched) this.jobs.delayQueued('subtitles', nextFetchAt(new Date()));
      log.close();
      this.logs.prune();
    }
  }

  private markDone(id: number, key: string): void {
    const now = new Date().toISOString();
    this.db
      .update(videos)
      .set({ subtitlesAt: now, subtitleLanguages: key, updatedAt: now })
      .where(eq(videos.id, id))
      .run();
  }

  /** The file grew (or shrank) by embedding: the video's size and its source's total follow. */
  private storeSize(video: typeof videos.$inferSelect, size: number): void {
    const delta = size - (video.fileSizeBytes ?? 0);
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.update(videos)
        .set({ fileSizeBytes: size, updatedAt: now })
        .where(eq(videos.id, video.id))
        .run();
      if (video.sourceId !== null && delta !== 0) {
        tx.update(sources)
          .set({ sizeBytes: sql`max(0, ${sources.sizeBytes} + ${delta})`, updatedAt: now })
          .where(eq(sources.id, video.sourceId))
          .run();
      }
    });
  }
}
