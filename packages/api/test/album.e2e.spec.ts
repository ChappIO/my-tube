import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AlbumDetail, DEFAULT_SOURCE_OPTIONS, DownloadMissingResult, and } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { albums, artists, jobs, sources, tracks } from '../src/database/schema.js';
import { JOB_RUNNERS } from '../src/jobs/job-runner.js';

/*
 * The album page: `GET /api/library/albums/:id` (the album, its artist, its tracks in the library
 * in album order, the totals) and `POST /api/library/albums/:id/download-missing`, against rows
 * seeded straight into the database. No job runners, so queued downloads stay queued.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));

describe('Album page (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const server = () => app.getHttpServer();

  let artistSource: number;
  let albumId: number;
  let otherAlbumId: number;
  let fullAlbumId: number;
  /** Track ids by a short name. */
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-album-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = join(root, 'video');
    process.env.MUSIC_DIR = join(root, 'music');
    process.env.YTDLP_PATH = FAKE_YTDLP;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JOB_RUNNERS)
      .useValue([])
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DATABASE);
    seed();
  });

  afterAll(async () => {
    await app.close();
    for (const name of ['CONFIG_DIR', 'VIDEO_DIR', 'MUSIC_DIR', 'YTDLP_PATH']) {
      delete process.env[name];
    }
    rmSync(root, { recursive: true, force: true });
  });

  function seed() {
    const now = new Date().toISOString();
    artistSource = db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: 'UCalbum',
        url: 'https://music.youtube.com/channel/UCalbum',
        name: 'Album Artist',
        subscribed: true,
        matcher: and(),
        options: DEFAULT_SOURCE_OPTIONS,
        lastCheckedAt: now,
        lastRevalidatedAt: now,
      })
      .returning()
      .get().id;
    const artistId = db
      .insert(artists)
      .values({
        name: 'Album Artist',
        youtubeId: 'UCalbum',
        sourceId: artistSource,
        avatarUrl: 'https://yt3.googleusercontent.com/a=s256',
      })
      .returning()
      .get().id;
    const bandId = db
      .insert(artists)
      .values({ name: 'Loose Band', youtubeId: null, sourceId: null })
      .returning()
      .get().id;
    const album = (title: string, youtubeId: string | null, artist = artistId) =>
      db
        .insert(albums)
        .values({ artistId: artist, title, year: 2007, youtubeId, trackCount: 6 })
        .returning()
        .get().id;
    albumId = album('In Order', 'OLAK5uy_order');
    otherAlbumId = album('Loose Ends', null, bandId);
    fullAlbumId = album('Complete', 'OLAK5uy_full');

    const track = (name: string, fields: Partial<typeof tracks.$inferInsert>) => {
      ids[name] = db
        .insert(tracks)
        .values({
          artistId,
          albumId,
          sourceId: artistSource,
          youtubeId: `yt-${name}`,
          title: `Track ${name}`,
          durationSeconds: 100,
          status: 'on_disk',
          ...fields,
        })
        .returning()
        .get().id;
    };
    // Inserted out of order: the page lists by disc, then track number.
    track('three', {
      trackNumber: 3,
      filePath: 'Album Artist/In Order/03 Track three.m4a',
      fileSizeBytes: 300,
    });
    track('one', {
      trackNumber: 1,
      filePath: 'Album Artist/In Order/01 Track one.m4a',
      fileSizeBytes: 100,
    });
    track('two', { trackNumber: 2, status: 'missing', filePath: 'Album Artist/In Order/02.m4a' });
    track('four', { trackNumber: 4, status: 'wanted' });
    track('disc2', {
      trackNumber: 1,
      discNumber: 2,
      filePath: 'Album Artist/In Order/2-01 Track disc2.m4a',
      fileSizeBytes: 50,
    });
    track('nomatch', { trackNumber: 5, status: 'skipped', skipReason: 'no_match' });
    track('unavailable', { trackNumber: 6, status: 'skipped', skipReason: 'unavailable' });
    track('deleted', { trackNumber: 7, status: 'skipped', skipReason: 'deleted_by_user' });
    track('loose', {
      artistId: bandId,
      albumId: otherAlbumId,
      sourceId: null,
      trackNumber: 1,
      status: 'missing',
      filePath: 'Loose Band/Loose Ends/01 loose.opus',
    });
    track('mixed-a', { albumId: fullAlbumId, trackNumber: 1, filePath: 'A/Complete/01.m4a' });
    track('mixed-b', { albumId: fullAlbumId, trackNumber: 2, filePath: 'A/Complete/02.opus' });
    for (const path of ['Album Artist/In Order/01 Track one.m4a', 'A/Complete/01.m4a']) {
      const target = join(root, 'music', path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'fake audio');
    }
  }

  async function detail(id: number): Promise<AlbumDetail> {
    const response = await request(server()).get(`/api/library/albums/${id}`).expect(200);
    return AlbumDetail.parse(response.body);
  }

  it('GET /api/library/albums/:id returns the album, its artist, the tracks in order and totals', async () => {
    const page = await detail(albumId);
    expect(page.album).toEqual({
      id: albumId,
      title: 'In Order',
      year: 2007,
      coverUrl: `/api/artwork/album/${albumId}`,
      youtubeId: 'OLAK5uy_order',
      youtubeUrl: 'https://music.youtube.com/playlist?list=OLAK5uy_order',
    });
    expect(page.artist).toMatchObject({
      name: 'Album Artist',
      sourceId: artistSource,
      subscribed: true,
      albumCount: 2,
      trackCount: 7,
    });
    expect(page.artist.avatarUrl).toMatch(/^\/api\/artwork\/artist\/\d+$/);
    // Skipped tracks (rules, unavailable, deleted) are not in the library.
    expect(page.tracks.map((track) => track.title)).toEqual([
      'Track one',
      'Track two',
      'Track three',
      'Track four',
      'Track disc2',
    ]);
    expect(page.tracks[0]).toMatchObject({
      filePath: 'Album Artist/In Order/01 Track one.m4a',
      mimeType: 'audio/mp4',
      album: { id: albumId, title: 'In Order' },
    });
    expect(page).toMatchObject({
      trackCount: 5,
      onDiskCount: 3,
      wantedCount: 1,
      missingCount: 2,
      queuedCount: 0,
      totalDurationSeconds: 500,
      sizeBytes: 450,
      container: 'm4a',
    });
  });

  it('an artist without a source, an album without a playlist id, a mixed container', async () => {
    const loose = await detail(otherAlbumId);
    expect(loose.artist).toMatchObject({ sourceId: null, subscribed: false, avatarUrl: null });
    expect(loose.album).toMatchObject({ youtubeId: null, youtubeUrl: null });
    expect(loose).toMatchObject({ trackCount: 1, onDiskCount: 0, container: null, sizeBytes: 0 });

    const mixed = await detail(fullAlbumId);
    expect(mixed).toMatchObject({ trackCount: 2, onDiskCount: 2, missingCount: 0 });
    expect(mixed.container).toBeNull();
  });

  it('GET /api/library/albums/:id is a 404 for an unknown album and a 400 for a bad id', async () => {
    const missing = await request(server()).get('/api/library/albums/9999').expect(404);
    expect(missing.body).toMatchObject({ message: 'Album 9999 not found' });
    await request(server()).get('/api/library/albums/abc').expect(400);
    const post = await request(server()).post('/api/library/albums/9999/download-missing');
    expect(post.status).toBe(404);
  });

  it('POST download-missing queues every track not on disk and leaves skipped tracks alone', async () => {
    // A failed download is retried by the explicit action.
    db.insert(jobs)
      .values({
        type: 'download',
        status: 'failed',
        payload: { title: 'Track four', trackId: ids.four! },
        dedupeKey: 'track:yt-four',
      })
      .run();

    const response = await request(server())
      .post(`/api/library/albums/${albumId}/download-missing`)
      .expect(202);
    expect(DownloadMissingResult.parse(response.body)).toEqual({ queued: 2 });

    const status = (name: string) =>
      db
        .select({ status: tracks.status, skipReason: tracks.skipReason })
        .from(tracks)
        .where(eq(tracks.id, ids[name]!))
        .get();
    expect(status('two')).toEqual({ status: 'wanted', skipReason: null });
    expect(status('four')).toEqual({ status: 'wanted', skipReason: null });
    expect(status('one')?.status).toBe('on_disk');
    expect(status('nomatch')).toEqual({ status: 'skipped', skipReason: 'no_match' });
    expect(status('unavailable')).toEqual({ status: 'skipped', skipReason: 'unavailable' });
    expect(status('deleted')).toEqual({ status: 'skipped', skipReason: 'deleted_by_user' });

    const queued = db
      .select({ key: jobs.dedupeKey, payload: jobs.payload })
      .from(jobs)
      .where(eq(jobs.status, 'queued'))
      .all();
    expect(queued.map((job) => job.key ?? '').toSorted((a, b) => a.localeCompare(b))).toEqual([
      'track:yt-four',
      'track:yt-two',
    ]);
    expect(queued[0]!.payload).toMatchObject({ historyKind: 'music', subtitle: 'Album Artist' });

    // The page counts them as queued; asking again adds nothing.
    expect((await detail(albumId)).queuedCount).toBe(2);
    const again = await request(server())
      .post(`/api/library/albums/${albumId}/download-missing`)
      .expect(202);
    expect(again.body).toEqual({ queued: 0 });
  });

  it('POST download-missing queues a track whose source is gone', async () => {
    const response = await request(server())
      .post(`/api/library/albums/${otherAlbumId}/download-missing`)
      .expect(202);
    expect(response.body).toEqual({ queued: 1 });
    const complete = await request(server())
      .post(`/api/library/albums/${fullAlbumId}/download-missing`)
      .expect(202);
    expect(complete.body).toEqual({ queued: 0 });
  });
});
