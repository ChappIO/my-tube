import { mkdirSync, statSync } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { renderPathTemplate } from '@mytube/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { albums, artists, sources, tracks } from '../database/schema.js';
import { JobLogsService } from '../jobs/job-logs.service.js';
import {
  PermanentJobError,
  type JobContext,
  type JobOutcome,
  type JobRow,
  type JobRunner,
} from '../jobs/job-runner.js';
import { cleanTrackTitle, parseTrackTitle } from '../metadata/clean-title.js';
import { MetadataChain } from '../metadata/metadata-chain.js';
import { type TrackTags, ytdlpTagArgs } from '../metadata/ytdlp-tags.js';
import { SettingsService } from '../settings/settings.service.js';
import type { SourceEntry } from '../ytdlp/metadata.js';
import { networkOptions } from '../ytdlp/network.js';
import { noDownloadableFormat, YtdlpError } from '../ytdlp/ytdlp-error.js';
import { YtdlpRunner, YtdlpSession } from '../ytdlp/ytdlp-runner.js';
import { insideLibrary } from './download.runner.js';
import { audioFormat, musicExtraArgs } from './music-options.js';
import { removePartials } from './partials.js';
import { NO_DOWNLOADABLE_FORMAT, probeForDownload } from './probe.js';
import { DownloadProgressTracker, isUnavailableReason } from './video-options.js';

type TrackRow = typeof tracks.$inferSelect;
type AlbumRow = typeof albums.$inferSelect;

/** What the path template and the tags are filled from. */
export type TrackPathValues = {
  artist: string;
  album: string | null;
  title: string;
  track: number | null;
  disc: number;
  year: number | null;
  id: string;
};

/** The track's watch page on YouTube Music: its metadata carries the album, artist and year. */
export function trackUrl(youtubeId: string): string {
  return `https://music.youtube.com/watch?v=${youtubeId}`;
}

/**
 * `download` jobs for tracks (payload `{ trackId, title, subtitle, historyKind: 'music',
 * detail, position? }`), dispatched here by `DownloadDispatchRunner`. The music twin of
 * `DownloadRunner`:
 *
 * 1. Loads the track, its artist and album; marks it `downloading`.
 * 2. Reads the track's own metadata on YouTube Music: the exact title (`track`), release date and
 *    year, and the album. A track without an album (a playlist or fallback listing) is filed
 *    under the album yt-dlp names, found or created by artist and title; an album without a
 *    year gets the release year (else the year of the release or upload date). Without a
 *    `track` field the upload's title is cleaned (`cleanTrackTitle`).
 * 3. Renders `music.pathTemplate` under `MUSIC_DIR` (`{artist}` the album artist, else the
 *    track artist; `{track}` the album position, or the playlist position when the job carries
 *    one, which a playlist source with "sync order" sets).
 * 4. Runs yt-dlp with Settings → Music (`-x`, container, quality, loudness normalization), and
 *    when the source embeds cover art the yt-dlp metadata provider's flags (`ytdlpTagArgs`).
 *    Progress goes through `DownloadProgressTracker` with the stream the metadata call (made with
 *    the same format selector) expects: the size up front, then the extraction, tagging and
 *    cover as post-processing stages.
 * 5. When the source tags its files and a metadata provider is enabled (MusicBrainz, Discogs),
 *    runs the `MetadataChain` on the file: lookups logged per provider, merged tags rewritten.
 *    It never fails the download.
 * 6. Marks the track `on_disk` with its path (relative to `MUSIC_DIR`), size and time, and adds
 *    the size to its source. History: `{ kind: 'music', result: 'done', details: path }`.
 *
 * Failures, unavailable tracks (and those with no downloadable format), cancels and shutdowns
 * behave as for videos.
 */
@Injectable()
export class TrackDownloadRunner implements JobRunner {
  readonly type = 'download';

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly runner: YtdlpRunner,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
    private readonly logs: JobLogsService,
    private readonly chain: MetadataChain,
  ) {}

  async run(job: JobRow, { signal, progress }: JobContext): Promise<JobOutcome | null> {
    const trackId = job.payload.trackId;
    if (typeof trackId !== 'number') throw new PermanentJobError('Job has no trackId');
    const track = this.db.select().from(tracks).where(eq(tracks.id, trackId)).get();
    if (!track) throw new PermanentJobError(`Track ${trackId} is no longer known`);
    if (
      track.status === 'on_disk' ||
      track.status === 'missing' ||
      (track.status === 'skipped' && track.skipReason !== 'unavailable')
    ) {
      return null;
    }

    const log = this.logs.open(job);
    const settings = this.settings.get();
    const network = networkOptions(settings.network);
    const url = trackUrl(track.youtubeId);
    this.setStatus(track.id, 'downloading');
    let target: string | null = null;
    const format = audioFormat(settings.music.container, settings.music.loudnessNormalization);
    // Shared by the probe and the download: the cookie order and the one diagnostic listing.
    const session = new YtdlpSession();
    try {
      // The same format selector as the download, so yt-dlp reports the stream it will fetch
      // and its size: the progress bar knows the total from the start. A probe that finds no
      // format does not fail the job (`probeForDownload`).
      const { info, sized } = await probeForDownload(this.runner, url, {
        format,
        network,
        session,
        signal,
        log: log.line,
      });
      const entry = info?.entries.find((item) => item.id === track.youtubeId) ?? info?.entries[0];
      const { current, album } = this.applyMetadata(track, entry, this.artistName(track.artistId));
      const artist = this.artistName(album?.artistId ?? current.artistId);
      const trackArtist = this.artistName(current.artistId);
      const position = job.payload.position;
      const values: TrackPathValues = {
        artist,
        album: album?.title ?? null,
        title: current.title,
        track: typeof position === 'number' ? position : current.trackNumber,
        disc: current.discNumber ?? 1,
        year: album?.year ?? yearOf(current.publishedAt),
        id: current.youtubeId,
      };

      target = insideLibrary(
        this.config.musicDir,
        renderPathTemplate(settings.music.pathTemplate, values),
      );
      mkdirSync(dirname(target), { recursive: true });
      log.line(`target ${target}.${settings.music.container}`);

      const tags: TrackTags = {
        title: current.title,
        artist: entry?.music?.artist ?? trackArtist,
        album: values.album,
        albumArtist: album ? artist : null,
        trackNumber: current.trackNumber,
        discNumber: current.discNumber,
        year: values.year,
      };
      const embedCoverArt = this.embedCoverArt(current);
      const tracker = new DownloadProgressTracker(sized ? entry?.expectedStreams : undefined);
      progress(tracker.start());
      const result = await this.runner.download(
        url,
        {
          output: `${target.replaceAll('%', '%%')}.%(ext)s`,
          format,
          extraArgs: [...musicExtraArgs(settings.music), ...ytdlpTagArgs(tags, { embedCoverArt })],
          network,
          session,
          signal,
          log: log.line,
        },
        (update) => {
          const report = tracker.update(update);
          if (report) progress(report);
        },
      );

      // The metadata chain after yt-dlp's tags: only when a provider is enabled and the source
      // tags its files at all. It logs every provider result and never fails the download.
      if (embedCoverArt && this.chain.active(settings.music).length > 0) {
        // An upload's title (no YouTube Music `track`) was cleaned for the library; the
        // providers search the clean title first and the upload's as the fallback, with the
        // artists it credits next to ours.
        const upload =
          entry?.title && !entry.music?.track ? parseTrackTitle(entry.title, trackArtist) : null;
        await this.chain.enrich(
          result.filePath,
          {
            youtubeId: current.youtubeId,
            tags,
            durationSeconds: current.durationSeconds,
            uploadTitle: upload && upload.plain !== current.title ? upload.plain : null,
            featuredArtists: upload?.featuredArtists ?? [],
          },
          { settings: settings.music, signal, log: log.line },
        );
      }

      const size = statSync(result.filePath).size;
      const filePath = relative(this.config.musicDir, result.filePath).split(sep).join('/');
      const now = new Date().toISOString();
      this.db.transaction((tx) => {
        tx.update(tracks)
          .set({
            status: 'on_disk',
            skipReason: null,
            filePath,
            fileSizeBytes: size,
            downloadedAt: now,
            updatedAt: now,
          })
          .where(eq(tracks.id, track.id))
          .run();
        if (track.sourceId !== null) {
          tx.update(sources)
            .set({ sizeBytes: sql`${sources.sizeBytes} + ${size}`, updatedAt: now })
            .where(eq(sources.id, track.sourceId))
            .run();
        }
      });
      log.line(`saved ${filePath} (${size} bytes)`);
      return { title: current.title, result: 'done', kind: 'music', details: filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.line(`failed: ${message}`);
      if (signal.aborted) {
        this.setStatus(track.id, 'wanted');
        if (signal.reason !== 'shutdown' && target) {
          removePartials(
            this.config.musicDir,
            target,
            log.line,
            new Set([settings.music.container]),
          );
        }
        throw error;
      }
      const reason = error instanceof YtdlpError ? error.reason : null;
      const noFormat = noDownloadableFormat(error);
      if (noFormat || isUnavailableReason(reason)) {
        this.db
          .update(tracks)
          .set({
            status: 'skipped',
            skipReason: 'unavailable',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tracks.id, track.id))
          .run();
        throw new PermanentJobError(noFormat ? NO_DOWNLOADABLE_FORMAT : (reason ?? message));
      }
      this.setStatus(track.id, 'wanted');
      throw error;
    } finally {
      log.close();
      this.logs.prune();
    }
  }

  /**
   * Stores what the track's own metadata says: the title (`track`), the release date, the
   * duration, the album (for a track without one) and the album's year. Returns the updated
   * track and its album.
   */
  private applyMetadata(
    track: TrackRow,
    entry: SourceEntry | undefined,
    artist: string,
  ): { current: TrackRow; album: AlbumRow | null } {
    const music = entry?.music;
    const now = new Date().toISOString();
    return this.db.transaction((tx) => {
      let albumId = track.albumId;
      if (albumId === null && music?.album) {
        const artistId = track.artistId;
        const found = tx
          .select({ id: albums.id })
          .from(albums)
          .where(
            and(
              eq(albums.artistId, artistId),
              sql`${albums.title} = ${music.album} COLLATE NOCASE`,
            ),
          )
          .get();
        albumId =
          found?.id ??
          tx
            .insert(albums)
            .values({ artistId, title: music.album, createdAt: now, updatedAt: now })
            .returning({ id: albums.id })
            .get().id;
      }
      // The release year, else the year of the release or upload date (official audio uploads
      // carry no release year; they go up when the album comes out).
      const year = music?.releaseYear ?? yearOf(music?.releaseDate ?? entry?.uploadDate ?? null);
      if (albumId !== null && year !== null) {
        tx.update(albums)
          .set({ year, updatedAt: now })
          .where(and(eq(albums.id, albumId), isNull(albums.year)))
          .run();
      }
      const current = tx
        .update(tracks)
        .set({
          title:
            music?.track ?? (entry?.title ? cleanTrackTitle(entry.title, artist) : track.title),
          publishedAt: music?.releaseDate ?? entry?.uploadDate ?? track.publishedAt,
          durationSeconds:
            entry?.duration == null ? track.durationSeconds : Math.round(entry.duration),
          albumId,
          trackNumber: track.trackNumber ?? music?.trackNumber ?? null,
          discNumber: track.discNumber ?? music?.discNumber ?? null,
          updatedAt: now,
        })
        .where(eq(tracks.id, track.id))
        .returning()
        .get();
      const album =
        albumId === null
          ? null
          : (tx.select().from(albums).where(eq(albums.id, albumId)).get() ?? null);
      return { current, album };
    });
  }

  private artistName(id: number): string {
    return (
      this.db.select({ name: artists.name }).from(artists).where(eq(artists.id, id)).get()?.name ??
      'Unknown artist'
    );
  }

  /** The source's "Embed cover art and tags" option; the Settings default without a source. */
  private embedCoverArt(track: TrackRow): boolean {
    if (track.sourceId !== null) {
      const source = this.db
        .select({ options: sources.options })
        .from(sources)
        .where(eq(sources.id, track.sourceId))
        .get();
      if (source) return source.options.embedCoverArt;
    }
    return this.settings.get().music.embedCoverArt;
  }

  private setStatus(id: number, status: 'wanted' | 'downloading'): void {
    this.db
      .update(tracks)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(tracks.id, id))
      .run();
  }
}

function yearOf(date: string | null): number | null {
  const year = date ? Number.parseInt(date.slice(0, 4), 10) : Number.NaN;
  return Number.isNaN(year) ? null : year;
}
