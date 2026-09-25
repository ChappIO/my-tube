import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_MUSIC_MATCHER, DEFAULT_SOURCE_OPTIONS, type SourceOptions } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import { albums, artists, sources, tracks } from '../database/schema.js';
import { JobLogsService } from '../jobs/job-logs.service.js';
import { PermanentJobError, type JobProgress } from '../jobs/job-runner.js';
import { MetadataChain } from '../metadata/metadata-chain.js';
import type { MetadataProvider, TrackLookup } from '../metadata/provider.js';
import type { TrackTags } from '../metadata/ytdlp-tags.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { DownloadDispatchRunner } from './download-dispatch.runner.js';
import { DownloadRunner } from './download.runner.js';
import { TrackDownloadRunner } from './track-download.runner.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
// The fake serves test/fixtures/ytdlp/music/track.json for music.youtube.com watch URLs:
// "Heatwave" by Test Artist on "First Light", released 2024-04-05.
const TRACK_ID = 'trk00000001';

function context(controller = new AbortController()) {
  const reports: JobProgress[] = [];
  return {
    reports,
    controller,
    ctx: { signal: controller.signal, progress: (update: JobProgress) => reports.push(update) },
  };
}

describe('TrackDownloadRunner (fake binary)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mytube-track-download-'));
  });

  afterEach(() => {
    for (const name of [
      'FAKE_YTDLP_FAIL',
      'FAKE_YTDLP_DELAY_MS',
      'FAKE_YTDLP_ARGS_FILE',
      'FAKE_YTDLP_FORMAT_ERROR',
      'FAKE_YTDLP_BOT_CHECK',
      'FAKE_YTDLP_FORMATS',
    ]) {
      delete process.env[name];
    }
    rmSync(root, { recursive: true, force: true });
  });

  function setup(options: { album?: boolean; sourceOptions?: SourceOptions } = {}) {
    const harness = createJobsHarness();
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const logs = new JobLogsService(config);
    const ytdlp = new YtdlpRunner({ path: () => FAKE });
    // A fake provider behind the MusicBrainz toggle and a writer that records instead of ffmpeg.
    const lookups: TrackLookup[] = [];
    const writes: { file: string; tags: Partial<TrackTags> }[] = [];
    const provider: MetadataProvider = {
      name: 'musicbrainz',
      label: 'FakeBrainz',
      enabled: (music) => music.metadataProviders.musicbrainz.enabled,
      lookup: (lookup) => {
        lookups.push(lookup);
        return Promise.resolve({
          match: {
            tags: { album: 'First Light (Deluxe)', year: 1999, discNumber: 1 },
            confidence: 0.95,
            summary: 'fixture',
          },
          tried: [lookup.tags.title ?? ''],
        });
      },
    };
    const chain = new MetadataChain([provider], {
      write: (file, tags) => {
        writes.push({ file, tags });
        return Promise.resolve();
      },
    });
    const runner = new TrackDownloadRunner(
      harness.db,
      ytdlp,
      harness.settings,
      config,
      logs,
      chain,
    );
    const source = harness.db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: 'UCartist000000000000001',
        url: 'https://music.youtube.com/channel/UCartist000000000000001',
        name: 'Test Artist',
        matcher: DEFAULT_MUSIC_MATCHER,
        options: options.sourceOptions ?? DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    const artist = harness.db
      .insert(artists)
      .values({ youtubeId: source.youtubeId, name: 'Test Artist', sourceId: source.id })
      .returning()
      .get();
    const album =
      options.album === false
        ? null
        : harness.db
            .insert(albums)
            .values({ artistId: artist.id, youtubeId: 'OLAK5uy_album1', title: 'First Light' })
            .returning()
            .get();
    const track = harness.db
      .insert(tracks)
      .values({
        artistId: artist.id,
        albumId: album?.id ?? null,
        sourceId: source.id,
        youtubeId: TRACK_ID,
        title: 'Heatwave',
        trackNumber: album ? 1 : null,
      })
      .returning()
      .get();
    const enqueue = (extra: Record<string, unknown> = {}) =>
      harness.jobs.enqueue({
        type: 'download',
        key: `track:${TRACK_ID}`,
        payload: {
          title: 'Heatwave',
          subtitle: 'Test Artist',
          historyKind: 'music',
          trackId: track.id,
          ...extra,
        },
      }).job;
    const row = () => harness.db.select().from(tracks).where(eq(tracks.id, track.id)).get()!;
    const argsFile = join(root, 'args.json');
    process.env.FAKE_YTDLP_ARGS_FILE = argsFile;
    const args = () => z.array(z.string()).parse(JSON.parse(readFileSync(argsFile, 'utf8')));
    return {
      ...harness,
      config,
      logs,
      runner,
      source,
      artist,
      album,
      track,
      enqueue,
      row,
      args,
      lookups,
      writes,
    };
  }

  const PROVIDERS_ON = {
    musicbrainz: { enabled: true },
    discogs: { enabled: false, token: null },
  };

  it('runs no metadata provider by default', async () => {
    const { runner, enqueue, lookups, writes } = setup();
    await runner.run(enqueue(), context().ctx);
    expect(lookups).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('runs the metadata chain on the file once a provider is enabled', async () => {
    const { runner, enqueue, settings, lookups, writes, config, logs } = setup();
    settings.patch({ music: { metadataProviders: PROVIDERS_ON } });
    const job = enqueue();
    const outcome = await runner.run(job, context().ctx);
    expect(outcome?.result).toBe('done');
    expect(lookups).toEqual([
      {
        youtubeId: TRACK_ID,
        durationSeconds: 201,
        // A YouTube Music track: its `track` field is the title, no upload title to fall back on.
        uploadTitle: null,
        featuredArtists: [],
        tags: {
          title: 'Heatwave',
          artist: 'Test Artist',
          album: 'First Light',
          albumArtist: 'Test Artist',
          trackNumber: 1,
          discNumber: null,
          year: 2024,
        },
      },
    ]);
    expect(writes).toEqual([
      {
        file: join(config.musicDir, 'Test Artist/First Light/01 Heatwave.m4a'),
        tags: expect.objectContaining({ album: 'First Light (Deluxe)', year: 1999, discNumber: 1 }),
      },
    ]);
    const log = readFileSync(logs.path(job.id), 'utf8');
    expect(log).toContain(
      'FakeBrainz: album "First Light (Deluxe)", disc 1, year 1999 for "Heatwave" by Test Artist',
    );
    expect(log).toContain('metadata: wrote album "First Light (Deluxe)", disc 1, year 1999');
  });

  it('skips the chain when the source does not tag its files', async () => {
    const { runner, enqueue, settings, lookups } = setup({
      sourceOptions: { ...DEFAULT_SOURCE_OPTIONS, embedCoverArt: false },
    });
    settings.patch({ music: { metadataProviders: PROVIDERS_ON } });
    await runner.run(enqueue(), context().ctx);
    expect(lookups).toEqual([]);
  });

  it('downloads to the music template, tags the file and marks the track on disk', async () => {
    const { runner, enqueue, row, db, source, album, config, args, logs } = setup();
    const job = enqueue();
    const { ctx, reports } = context();

    const outcome = await runner.run(job, ctx);

    const path = 'Test Artist/First Light/01 Heatwave.m4a';
    expect(outcome).toEqual({ title: 'Heatwave', result: 'done', kind: 'music', details: path });
    expect(readFileSync(join(config.musicDir, path), 'utf8')).toBe('fake media');
    expect(row()).toMatchObject({
      status: 'on_disk',
      filePath: path,
      fileSizeBytes: 10,
      publishedAt: '2024-04-05',
      durationSeconds: 201,
    });
    // The release year from the track's metadata fills the album's.
    expect(db.select().from(albums).where(eq(albums.id, album!.id)).get()?.year).toBe(2024);
    expect(db.select().from(sources).where(eq(sources.id, source.id)).get()?.sizeBytes).toBe(10);
    // The metadata call used the download's format selector, so the size is known up front;
    // post-processing shows as a stage.
    expect(reports[0]).toEqual({ totalBytes: 3_000_000 });
    expect(reports.some((report) => (report.progress ?? 0) > 0)).toBe(true);
    expect(reports.some((report) => typeof report.stage === 'string')).toBe(true);

    const list = args();
    const after = (flag: string) => list[list.indexOf(flag) + 1];
    expect(list.at(-1)).toBe(`https://music.youtube.com/watch?v=${TRACK_ID}`);
    expect(after('-f')).toBe('bestaudio[ext=m4a]/bestaudio/best');
    expect(list).toContain('-x');
    expect(after('--audio-format')).toBe('m4a');
    expect(after('--audio-quality')).toBe('0');
    expect(after('-o')).toBe(join(config.musicDir, 'Test Artist/First Light/01 Heatwave.%(ext)s'));
    // Cover art and tags are on for the source: the yt-dlp provider's flags.
    expect(list).toEqual(expect.arrayContaining(['--embed-metadata', '--embed-thumbnail']));
    const parsed = list.filter((_, index) => list[index - 1] === '--parse-metadata');
    expect(parsed).toEqual([
      'pre_process:#Heatwave#:(?s)^#(?P<meta_title>.*)#$',
      'pre_process:#Test Artist#:(?s)^#(?P<meta_artist>.*)#$',
      'pre_process:#First Light#:(?s)^#(?P<meta_album>.*)#$',
      'pre_process:#Test Artist#:(?s)^#(?P<meta_album_artist>.*)#$',
      'pre_process:#1#:(?s)^#(?P<meta_track>.*)#$',
      'pre_process:#2024#:(?s)^#(?P<meta_date>.*)#$',
    ]);
    expect(list.some((arg) => arg.includes('loudnorm'))).toBe(false);
    expect(readFileSync(logs.path(job.id), 'utf8')).toContain(`saved ${path} (10 bytes)`);
  });

  it('normalizes loudness and skips cover art and tags when the source says so', async () => {
    const { runner, enqueue, settings, args } = setup({
      sourceOptions: { ...DEFAULT_SOURCE_OPTIONS, embedCoverArt: false },
    });
    settings.patch({
      music: { loudnessNormalization: true, container: 'mp3', audioQuality: '320k' },
    });
    const outcome = await runner.run(enqueue(), context().ctx);
    expect(outcome?.details).toBe('Test Artist/First Light/01 Heatwave.mp3');
    const list = args();
    const after = (flag: string) => list[list.indexOf(flag) + 1];
    expect(after('--audio-format')).toBe('mp3');
    expect(after('--audio-quality')).toBe('320k');
    expect(after('--postprocessor-args')).toBe(
      'ExtractAudio+ffmpeg_o:-af loudnorm=I=-14:TP=-1:LRA=11 -ar 48000',
    );
    expect(list).not.toContain('--embed-thumbnail');
    expect(list).not.toContain('--parse-metadata');
  });

  it('files a track without an album under the album its metadata names', async () => {
    const { runner, enqueue, row, db, artist } = setup({ album: false });
    // Sync in playlist order: the playlist position numbers the file.
    const outcome = await runner.run(enqueue({ position: 7 }), context().ctx);
    expect(outcome?.details).toBe('Test Artist/First Light/07 Heatwave.m4a');
    const album = db.select().from(albums).get();
    expect(album).toMatchObject({ artistId: artist.id, title: 'First Light', youtubeId: null });
    expect(row().albumId).toBe(album?.id);
  });

  it('marks an unavailable track and fails for good', async () => {
    const { runner, enqueue, row } = setup();
    process.env.FAKE_YTDLP_FAIL = '1';
    const error = await runner.run(enqueue(), context().ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PermanentJobError);
    expect(row()).toMatchObject({ status: 'skipped', skipReason: 'unavailable' });
  });

  describe('when no format is available', () => {
    const DIAGNOSTIC = '--- formats (diagnostic) ---';

    it('retries the size probe without -f and downloads', async () => {
      const { runner, enqueue, row, logs } = setup();
      process.env.FAKE_YTDLP_FORMAT_ERROR = 'probe';
      const job = enqueue();
      const { ctx, reports } = context();
      const outcome = await runner.run(job, ctx);
      expect(outcome?.result).toBe('done');
      expect(row().status).toBe('on_disk');
      // The probe without -f resolves yt-dlp's default selection: its sizes are not used.
      expect(reports[0]).toEqual({});
      const log = readFileSync(logs.path(job.id), 'utf8');
      expect(count(log, DIAGNOSTIC)).toBe(1);
      expect(log).toContain(
        'size probe: no format matches -f bestaudio[ext=m4a]/bestaudio/best; probing again without -f (sizes unknown)',
      );
    });

    it('runs every call without the cookies file when YouTube does not ask for it', async () => {
      const { runner, enqueue, row, settings, args, logs } = setup();
      settings.patch({ network: { cookiesFile: join(root, 'cookies.txt') } });
      // A signed-in session would lose every format (the PO-token case): not used.
      process.env.FAKE_YTDLP_FORMAT_ERROR = 'cookies';
      const job = enqueue();
      await runner.run(job, context().ctx);
      expect(row().status).toBe('on_disk');
      expect(args()).not.toContain('--cookies');
      const log = readFileSync(logs.path(job.id), 'utf8');
      expect(log).not.toContain('--cookies');
      expect(count(log, 'yt-dlp: succeeded without cookies')).toBe(2);
      expect(log).not.toContain(DIAGNOSTIC);
    });

    it('uses the cookies after a bot check, for the rest of the job', async () => {
      const { runner, enqueue, row, settings, logs } = setup();
      settings.patch({ network: { cookiesFile: join(root, 'cookies.txt') } });
      process.env.FAKE_YTDLP_BOT_CHECK = '1';
      const job = enqueue();
      await runner.run(job, context().ctx);
      expect(row().status).toBe('on_disk');
      const log = readFileSync(logs.path(job.id), 'utf8');
      expect(count(log, 'retrying with cookies: [youtube] trk00000001: Sign in to confirm')).toBe(
        1,
      );
      expect(count(log, 'yt-dlp: succeeded with cookies')).toBe(2);
    });

    it('fails for good with no downloadable format when there is none at all', async () => {
      const { runner, enqueue, row, logs } = setup();
      process.env.FAKE_YTDLP_FORMAT_ERROR = 'always';
      process.env.FAKE_YTDLP_FORMATS = 'none';
      const job = enqueue();
      const error = await runner.run(job, context().ctx).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PermanentJobError);
      expect(error).toMatchObject({ message: 'no downloadable format' });
      expect(row()).toMatchObject({ status: 'skipped', skipReason: 'unavailable' });
      const log = readFileSync(logs.path(job.id), 'utf8');
      expect(count(log, DIAGNOSTIC)).toBe(1);
      expect(log).toContain('No video formats found!');
      expect(log).toContain(
        'size probe: no format without -f either; downloading without the metadata',
      );
    });

    it('stays retryable when formats exist or were skipped', async () => {
      const { runner, enqueue, row } = setup();
      process.env.FAKE_YTDLP_FORMAT_ERROR = 'always';
      process.env.FAKE_YTDLP_FORMATS = 'storyboards';
      const error = await runner.run(enqueue(), context().ctx).catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(PermanentJobError);
      expect(error).toMatchObject({ failure: 'format_unavailable' });
      expect(row().status).toBe('wanted');
    });
  });

  it('cancels: removes the partial files and the source stream, keeps the track wanted', async () => {
    const { runner, enqueue, row, config } = setup();
    const folder = join(config.musicDir, 'Test Artist/First Light');
    mkdirSync(folder, { recursive: true });
    const partial = join(folder, '01 Heatwave.webm.part');
    const source = join(folder, '01 Heatwave.webm');
    const other = join(folder, '02 Low Tide.m4a');
    for (const file of [partial, source, other]) writeFileSync(file, 'x');
    process.env.FAKE_YTDLP_DELAY_MS = '200';
    const { ctx, controller, reports } = context();
    const running = runner.run(enqueue(), ctx).catch((e: unknown) => e);
    await waitFor(() => reports.length > 0);
    controller.abort('cancel');
    await running;
    expect(row().status).toBe('wanted');
    expect(existsSync(partial)).toBe(false);
    expect(existsSync(source)).toBe(false);
    expect(existsSync(other)).toBe(true);
  });

  it('does nothing for a track already on disk or skipped by the rules', async () => {
    const { runner, enqueue, db, track } = setup();
    db.update(tracks).set({ status: 'on_disk' }).where(eq(tracks.id, track.id)).run();
    await expect(runner.run(enqueue(), context().ctx)).resolves.toBeNull();
  });

  it('is what the download dispatcher runs for a job with a trackId', async () => {
    const { enqueue, runner, config, logs, db, settings } = setup();
    const videos = new DownloadRunner(
      db,
      new YtdlpRunner({ path: () => FAKE }),
      settings,
      config,
      logs,
    );
    const dispatch = new DownloadDispatchRunner(videos, runner);
    const outcome = await dispatch.run(enqueue(), context().ctx);
    expect(outcome?.kind).toBe('music');
    await expect(
      dispatch.run({ ...enqueue(), payload: { title: 'x', videoId: 999 } }, context().ctx),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});

function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
