import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AlbumDetail,
  ArtistDetail,
  DEFAULT_SOURCE_OPTIONS,
  DownloadMissingResult,
  and,
  not,
} from '@mytube/shared';
import { and as sqlAnd, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { albums, artists, jobs, sources, tracks } from '../src/database/schema.js';
import { JOB_RUNNERS } from '../src/jobs/job-runner.js';

/*
 * The artist page: `GET /api/library/artists/:id` (its albums in the library, its other releases,
 * the counts), `POST /api/library/artists/:id/download-missing`, and the pin: Download of a whole
 * release (`POST /api/library/albums/:id/download`) and Unpin (`DELETE /api/library/albums/:id/pin`),
 * against rows seeded straight into the database. No job runners, so jobs stay queued.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));

describe('Artist page (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const server = () => app.getHttpServer();

  let sourceId: number;
  let artistId: number;
  /** Album ids by a short name. */
  const album: Record<string, number> = {};
  /** Track ids by a short name. */
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-artist-e2e-'));
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
    sourceId = db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: 'UCartistpage',
        url: 'https://music.youtube.com/channel/UCartistpage',
        name: 'Page Artist',
        subscribed: true,
        matcher: and(not({ type: 'title_contains', text: 'live' })),
        options: DEFAULT_SOURCE_OPTIONS,
        lastCheckedAt: now,
        lastRevalidatedAt: now,
        createdAt: '2026-06-12T10:00:00.000Z',
      })
      .returning()
      .get().id;
    artistId = db
      .insert(artists)
      .values({
        name: 'Page Artist',
        youtubeId: 'UCartistpage',
        sourceId,
        avatarUrl: 'https://yt3.googleusercontent.com/a=s256',
      })
      .returning()
      .get().id;
    const otherArtist = db
      .insert(artists)
      .values({ name: 'Someone Else', youtubeId: null, sourceId: null })
      .returning()
      .get().id;
    const addAlbum = (
      name: string,
      fields: Partial<typeof albums.$inferInsert> = {},
      artist = artistId,
    ) => {
      album[name] = db
        .insert(albums)
        .values({ artistId: artist, title: name, youtubeId: `OLAK5uy_${name}`, ...fields })
        .returning()
        .get().id;
    };
    // Recorded in Releases-tab order (newest first); only downloads fill in the year.
    addAlbum('Partial', { year: 2021, trackCount: 4 });
    addAlbum('Complete', { year: 2020, trackCount: 2 });
    addAlbum('Skipped', { trackCount: 5 });
    addAlbum('Deleted', { trackCount: 1 });
    addAlbum('Refused', { trackCount: 1 });
    addAlbum('Single', { trackCount: 1 });
    addAlbum('Elsewhere', { trackCount: 1 }, otherArtist);

    const track = (
      name: string,
      albumName: string,
      fields: Partial<typeof tracks.$inferInsert>,
    ) => {
      ids[name] = db
        .insert(tracks)
        .values({
          artistId: albumName === 'Elsewhere' ? otherArtist : artistId,
          albumId: album[albumName],
          sourceId,
          youtubeId: `yt-${name}`,
          title: `Track ${name}`,
          durationSeconds: 100,
          status: 'on_disk',
          ...fields,
        })
        .returning()
        .get().id;
    };
    track('c1', 'Complete', { trackNumber: 1, filePath: 'a/c1.m4a' });
    track('c2', 'Complete', { trackNumber: 2, filePath: 'a/c2.m4a' });
    track('p1', 'Partial', { trackNumber: 1, filePath: 'a/p1.m4a' });
    track('p2', 'Partial', { trackNumber: 2, status: 'missing', filePath: 'a/p2.m4a' });
    track('p3', 'Partial', { trackNumber: 3, status: 'wanted' });
    track('p4', 'Partial', { trackNumber: 4, status: 'skipped', skipReason: 'no_match' });
    track('s1', 'Skipped', { trackNumber: 1, status: 'skipped', skipReason: 'no_match' });
    track('s2', 'Skipped', { trackNumber: 2, status: 'skipped', skipReason: 'no_match' });
    track('s3', 'Skipped', { trackNumber: 3, status: 'skipped', skipReason: 'unavailable' });
    track('d1', 'Deleted', { trackNumber: 1, status: 'skipped', skipReason: 'deleted_by_user' });
    track('r1', 'Refused', { trackNumber: 1, status: 'skipped', skipReason: 'unavailable' });
    track('e1', 'Elsewhere', { trackNumber: 1, status: 'skipped', skipReason: 'no_match' });
  }

  const getArtist = async () => {
    const res = await request(server()).get(`/api/library/artists/${artistId}`).expect(200);
    return ArtistDetail.parse(res.body);
  };
  const status = (name: string) => db.select().from(tracks).where(eq(tracks.id, ids[name]!)).get();

  it('lists the albums in the library and the other releases with the counts', async () => {
    const detail = await getArtist();
    expect(detail.artist).toEqual({
      id: artistId,
      name: 'Page Artist',
      avatarUrl: `/api/artwork/artist/${artistId}`,
      youtubeUrl: 'https://music.youtube.com/channel/UCartistpage',
      sourceId,
      subscribed: true,
      since: '2026-06-12T10:00:00.000Z',
      lastCheckedAt: expect.any(String),
      matcher: and(not({ type: 'title_contains', text: 'live' })),
    });
    expect(detail).toMatchObject({
      albumCount: 2,
      onDiskTracks: 3,
      missingTracks: 2,
      wantedTracks: 1,
      queuedTracks: 0,
    });
    // Newest year first.
    expect(detail.inLibrary.map((item) => item.title)).toEqual(['Partial', 'Complete']);
    expect(detail.inLibrary[0]).toMatchObject({
      id: album.Partial,
      year: 2021,
      coverUrl: `/api/artwork/album/${album.Partial}`,
      artist: { id: artistId, name: 'Page Artist' },
      trackCount: 3,
      onDiskCount: 1,
      wantedCount: 1,
      missingCount: 2,
      firstTrackId: ids.p1,
      pinned: false,
    });
    expect(detail.inLibrary[1]).toMatchObject({ trackCount: 2, onDiskCount: 2, missingCount: 0 });
    // Skipped by the rules, in the order they were recorded; YouTube's count. A release of only
    // unavailable tracks, one without tracks and another artist's are not listed.
    expect(detail.notInLibrary).toEqual([
      {
        id: album.Skipped,
        title: 'Skipped',
        year: null,
        coverUrl: `/api/artwork/album/${album.Skipped}`,
        trackCount: 5,
        youtubeUrl: 'https://music.youtube.com/playlist?list=OLAK5uy_Skipped',
      },
      expect.objectContaining({ id: album.Deleted, trackCount: 1 }),
    ]);
  });

  it('answers 404 for an unknown artist and 400 for a non-numeric id', async () => {
    const unknown = await request(server()).get('/api/library/artists/9999');
    expect(unknown.status).toBe(404);
    const bad = await request(server()).get('/api/library/artists/abc');
    expect(bad.status).toBe(400);
    const download = await request(server()).post('/api/library/artists/9999/download-missing');
    expect(download.status).toBe(404);
  });

  it('shows an artist that is not a source without subscription data', async () => {
    const other = db.select().from(artists).where(eq(artists.name, 'Someone Else')).get()!;
    const res = await request(server()).get(`/api/library/artists/${other.id}`).expect(200);
    const detail = ArtistDetail.parse(res.body);
    expect(detail.artist).toMatchObject({
      sourceId: null,
      subscribed: false,
      since: null,
      matcher: null,
      youtubeUrl: null,
    });
    expect(detail.inLibrary).toEqual([]);
    expect(detail.notInLibrary.map((item) => item.title)).toEqual(['Elsewhere']);
  });

  it('downloads the missing tracks across the albums, never the rule-skipped ones', async () => {
    const res = await request(server())
      .post(`/api/library/artists/${artistId}/download-missing`)
      .expect(202);
    expect(DownloadMissingResult.parse(res.body)).toEqual({ queued: 2 });
    expect(status('p2')?.status).toBe('wanted');
    expect(status('p4')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    expect(status('s1')?.status).toBe('skipped');
    expect((await getArtist()).queuedTracks).toBe(2);

    const again = await request(server())
      .post(`/api/library/artists/${artistId}/download-missing`)
      .expect(202);
    expect(again.body).toEqual({ queued: 0 });
  });

  it('pins a release the rules skip, queues it and lists it in the library', async () => {
    const res = await request(server())
      .post(`/api/library/albums/${album.Skipped}/download`)
      .expect(202);
    // The two rule-skipped tracks; the unavailable one stays skipped.
    expect(DownloadMissingResult.parse(res.body)).toEqual({ queued: 2 });
    expect(db.select().from(albums).where(eq(albums.id, album.Skipped!)).get()?.pinned).toBe(true);
    expect(status('s1')).toMatchObject({ status: 'wanted', skipReason: null });
    expect(status('s3')).toMatchObject({ status: 'skipped', skipReason: 'unavailable' });
    const keys = db
      .select({ key: jobs.dedupeKey })
      .from(jobs)
      .where(eq(jobs.type, 'download'))
      .all()
      .map((row) => row.key);
    expect(keys).toEqual(expect.arrayContaining(['track:yt-s1', 'track:yt-s2']));

    const detail = await getArtist();
    expect(detail.inLibrary.find((item) => item.id === album.Skipped)).toMatchObject({
      pinned: true,
      trackCount: 2,
      onDiskCount: 0,
      wantedCount: 2,
      missingCount: 2,
    });
    expect(detail.notInLibrary.map((item) => item.title)).toEqual(['Deleted']);
    const page = await request(server()).get(`/api/library/albums/${album.Skipped}`).expect(200);
    expect(AlbumDetail.parse(page.body).album.pinned).toBe(true);

    // A deleted file comes back too: the user asked for the whole release.
    await request(server()).post(`/api/library/albums/${album.Deleted}/download`).expect(202);
    expect(status('d1')).toMatchObject({ status: 'wanted', skipReason: null });
    await request(server()).post('/api/library/albums/9999/download').expect(404);
  });

  it('unpins an album and queues a revalidation of its source', async () => {
    await request(server()).delete(`/api/library/albums/${album.Skipped}/pin`).expect(204);
    expect(db.select().from(albums).where(eq(albums.id, album.Skipped!)).get()?.pinned).toBe(false);
    const revalidate = db
      .select()
      .from(jobs)
      .where(sqlAnd(eq(jobs.type, 'revalidate'), eq(jobs.dedupeKey, `source:${sourceId}`)))
      .get();
    expect(revalidate?.status).toBe('queued');
    const page = await request(server()).get(`/api/library/albums/${album.Skipped}`).expect(200);
    expect(AlbumDetail.parse(page.body).album.pinned).toBe(false);
    await request(server()).delete('/api/library/albums/9999/pin').expect(404);
  });
});
