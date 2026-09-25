import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AlbumListItem,
  ArtistListItem,
  DEFAULT_SOURCE_OPTIONS,
  HistoryEntry,
  HomeFeed,
  LibrarySummary,
  PlaylistListItem,
  Source,
  TrackListItem,
  and,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import {
  albums,
  artists,
  playlistItems,
  playlists,
  sources,
  tracks,
} from '../src/database/schema.js';

/*
 * The music read endpoints (artists, albums, playlists, one track), Preview's track stream and
 * Delete file, the music items of Home and the Music summary, against rows seeded straight into
 * the database and files in a temp MUSIC_DIR.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function bytes(response: request.Response): Buffer {
  const body: unknown = response.body;
  if (!Buffer.isBuffer(body)) throw new Error('Expected a binary body');
  return body;
}

describe('Music library (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const server = () => app.getHttpServer();
  const musicDir = () => join(root, 'music');

  let artistSource: number;
  const artistIds: Record<string, number> = {};
  const albumIds: Record<string, number> = {};
  /** Track ids by a short name. */
  const ids: Record<string, number> = {};
  let roadTrip: number;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-music-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = join(root, 'video');
    process.env.MUSIC_DIR = musicDir();
    process.env.YTDLP_PATH = FAKE_YTDLP;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function file(path: string, content = 'fake audio') {
    const target = join(musicDir(), path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function seed() {
    const now = new Date().toISOString();
    // Checked and revalidated just now, so the scheduler leaves the sources alone.
    const source = (
      kind: 'artist' | 'playlist',
      youtubeId: string,
      name: string,
      subscribed: boolean,
    ) =>
      db
        .insert(sources)
        .values({
          library: 'music',
          kind,
          youtubeId,
          url: `https://music.youtube.com/channel/${youtubeId}`,
          name,
          subscribed,
          matcher: and(),
          options: DEFAULT_SOURCE_OPTIONS,
          lastCheckedAt: now,
          lastRevalidatedAt: now,
          itemCount: 4,
          sizeBytes: 30,
        })
        .returning()
        .get().id;
    artistSource = source('artist', 'UCtest', 'Test Artist', true);
    const otherSource = source('artist', 'UCother', 'Other Artist', false);
    const playlistSource = source('playlist', 'PLroad', 'Road Trip', false);

    const artist = (name: string, youtubeId: string | null, sourceId: number | null) => {
      artistIds[name] = db
        .insert(artists)
        .values({
          name,
          youtubeId,
          sourceId,
          avatarUrl: sourceId ? `https://yt3.googleusercontent.com/${name}=s256` : null,
        })
        .returning()
        .get().id;
    };
    artist('Test Artist', 'UCtest', artistSource);
    artist('Other Artist', 'UCother', otherSource);
    artist('Band One', 'UCband', null);

    const album = (title: string, year: number, coverUrl: string | null) => {
      albumIds[title] = db
        .insert(albums)
        .values({ artistId: artistIds['Test Artist']!, title, year, coverUrl, trackCount: 3 })
        .returning()
        .get().id;
    };
    album('First Light', 2024, 'https://i9.ytimg.com/s_p/OLAKfirst/maxresdefault.jpg');
    album('Heatwave', 2023, 'https://i9.ytimg.com/s_p/OLAKheat/maxresdefault.jpg');
    album('Outtakes', 2022, null);

    const track = (name: string, fields: Partial<typeof tracks.$inferInsert>) => {
      ids[name] = db
        .insert(tracks)
        .values({
          artistId: artistIds['Test Artist']!,
          sourceId: artistSource,
          youtubeId: `yt-${name}`,
          title: `Track ${name}`,
          durationSeconds: 200,
          thumbnailUrl: `https://i.ytimg.com/vi/yt-${name}/hqdefault.jpg`,
          status: 'on_disk',
          ...fields,
        })
        .returning()
        .get().id;
    };
    const first = albumIds['First Light']!;
    track('one', {
      albumId: first,
      trackNumber: 1,
      filePath: 'Test Artist/First Light/01 Track one.m4a',
      fileSizeBytes: 10,
      downloadedAt: now,
    });
    track('two', {
      albumId: first,
      trackNumber: 2,
      filePath: 'Test Artist/First Light/02 Track two.m4a',
      fileSizeBytes: 10,
      downloadedAt: now,
    });
    track('three', { albumId: first, trackNumber: 3, status: 'wanted' });
    track('skipped', {
      albumId: first,
      trackNumber: 4,
      status: 'skipped',
      skipReason: 'no_match',
    });
    track('single', {
      albumId: albumIds.Heatwave!,
      trackNumber: 1,
      filePath: 'Test Artist/Heatwave/01 Track single.mp3',
      fileSizeBytes: 10,
      downloadedAt: now,
    });
    track('outtake', { albumId: albumIds.Outtakes!, status: 'skipped', skipReason: 'no_match' });
    track('road', {
      artistId: artistIds['Band One']!,
      sourceId: playlistSource,
      durationSeconds: 180,
      filePath: 'Band One/Track road.opus',
      fileSizeBytes: 10,
      downloadedAt: now,
    });
    track('gone', {
      artistId: artistIds['Band One']!,
      sourceId: playlistSource,
      durationSeconds: 100,
      status: 'missing',
      filePath: 'Band One/Track gone.m4a',
    });
    file('Test Artist/First Light/01 Track one.m4a');
    file('Test Artist/First Light/02 Track two.m4a');
    file('Test Artist/Heatwave/01 Track single.mp3');
    file('Band One/Track road.opus');

    roadTrip = db
      .insert(playlists)
      .values({
        library: 'music',
        youtubeId: 'PLroad',
        name: 'Road Trip',
        sourceId: playlistSource,
      })
      .returning()
      .get().id;
    db.insert(playlists).values({ library: 'music', youtubeId: 'PLempty', name: 'Empty' }).run();
    [ids.road, ids.two, ids.gone].forEach((trackId, index) =>
      db
        .insert(playlistItems)
        .values({ playlistId: roadTrip, position: index + 1, trackId: trackId! })
        .run(),
    );
  }

  it('GET /api/library/artists lists artists with counts and the subscription', async () => {
    const list = z
      .array(ArtistListItem)
      .parse((await request(server()).get('/api/library/artists').expect(200)).body);
    expect(list.map((artist) => artist.name)).toEqual(['Band One', 'Other Artist', 'Test Artist']);
    expect(list[2]).toEqual({
      id: artistIds['Test Artist'],
      name: 'Test Artist',
      avatarUrl: `/api/artwork/artist/${artistIds['Test Artist']}`,
      subscribed: true,
      sourceId: artistSource,
      albumCount: 2,
      trackCount: 4,
    });
    expect(list[0]).toMatchObject({
      subscribed: false,
      sourceId: null,
      avatarUrl: null,
      albumCount: 0,
      trackCount: 2,
    });
    expect(list[1]).toMatchObject({ subscribed: false, albumCount: 0, trackCount: 0 });
  });

  it('GET /api/library/albums counts tracks in the library and on disk', async () => {
    const list = z
      .array(AlbumListItem)
      .parse((await request(server()).get('/api/library/albums').expect(200)).body);
    // Outtakes has only skipped tracks: not listed. Newest year first.
    expect(list.map((album) => album.title)).toEqual(['First Light', 'Heatwave']);
    expect(list[0]).toEqual({
      id: albumIds['First Light'],
      title: 'First Light',
      year: 2024,
      coverUrl: `/api/artwork/album/${albumIds['First Light']}`,
      artist: { id: artistIds['Test Artist'], name: 'Test Artist' },
      trackCount: 3,
      onDiskCount: 2,
      firstTrackId: ids.one,
    });
    expect(list[1]).toMatchObject({ trackCount: 1, onDiskCount: 1, firstTrackId: ids.single });

    const none = z
      .array(AlbumListItem)
      .parse(
        (await request(server()).get(`/api/library/albums?artistId=${artistIds['Band One']}`)).body,
      );
    expect(none).toEqual([]);
    await request(server()).get('/api/library/albums?artistId=abc').expect(400);
  });

  it('GET /api/library/playlists gives counts, duration and the stack covers', async () => {
    const list = z
      .array(PlaylistListItem)
      .parse(
        (await request(server()).get('/api/library/playlists?library=music').expect(200)).body,
      );
    // "Empty" has no source and nothing on disk: not listed.
    expect(list).toEqual([
      {
        id: roadTrip,
        name: 'Road Trip',
        sourceId: expect.any(Number),
        trackCount: 3,
        onDiskCount: 2,
        durationSeconds: 480,
        covers: [`/api/artwork/track/${ids.road}`, `/api/artwork/album/${albumIds['First Light']}`],
        firstTrackId: ids.road,
      },
    ]);
    await request(server()).get('/api/library/playlists?library=video').expect(400);
  });

  it('GET /api/library/summary counts the music library', async () => {
    const summary = LibrarySummary.parse(
      (await request(server()).get('/api/library/summary').expect(200)).body,
    );
    expect(summary.music).toEqual({
      artists: 3,
      albums: 2,
      playlists: 1,
      artistSubscriptions: 1,
    });
  });

  it('GET /api/library/tracks/:id returns one track with its artist and album', async () => {
    const item = TrackListItem.parse(
      (await request(server()).get(`/api/library/tracks/${ids.one}`).expect(200)).body,
    );
    expect(item).toMatchObject({
      title: 'Track one',
      mimeType: 'audio/mp4',
      coverUrl: `/api/artwork/album/${albumIds['First Light']}`,
      artist: { name: 'Test Artist', sourceId: artistSource },
      album: { title: 'First Light', year: 2024 },
    });
    const road = TrackListItem.parse(
      (await request(server()).get(`/api/library/tracks/${ids.road}`)).body,
    );
    expect(road).toMatchObject({
      album: null,
      coverUrl: `/api/artwork/track/${ids.road}`,
      mimeType: 'audio/ogg; codecs=opus',
    });
    await request(server()).get('/api/library/tracks/9999').expect(404);
  });

  it('GET /api/library/home mixes music items in', async () => {
    const feed = HomeFeed.parse(
      (await request(server()).get('/api/library/home?tz=UTC').expect(200)).body,
    );
    const items = feed.groups.flatMap((group) => group.items);
    expect(
      items
        .filter((item) => item.kind === 'music')
        .map((item) => item.title)
        .toSorted(),
    ).toEqual(['Track one', 'Track road', 'Track single', 'Track two']);
    expect(feed.stats.librarySizeBytes).toBe(40);
  });

  describe('artwork', () => {
    it('serves album covers and track thumbnails through the cache, sidecars first', async () => {
      const fetchMock = vi.fn<typeof fetch>(
        async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const cover = await request(server())
        .get(`/api/artwork/album/${albumIds['First Light']}`)
        .responseType('blob')
        .expect(200);
      expect(cover.headers['content-type']).toBe('image/png');
      expect(JSON.stringify(fetchMock.mock.calls[0]?.[0])).toContain('OLAKfirst');

      // An album without a cover of its own shows its first track's thumbnail.
      await request(server()).get(`/api/artwork/album/${albumIds.Outtakes}`).expect(200);
      expect(JSON.stringify(fetchMock.mock.calls.at(-1)?.[0])).toContain('yt-outtake');

      file('Band One/Track road.jpg', 'sidecar');
      const sidecar = await request(server())
        .get(`/api/artwork/track/${ids.road}`)
        .responseType('blob')
        .expect(200);
      expect(bytes(sidecar).toString()).toBe('sidecar');
      await request(server()).get('/api/artwork/album/9999').expect(404);
    });
  });

  describe('track stream and Delete file', () => {
    it('streams the audio with range support and its content type', async () => {
      const whole = await request(server())
        .get(`/api/library/tracks/${ids.one}/stream`)
        .responseType('blob')
        .expect(200);
      expect(whole.headers['content-type']).toBe('audio/mp4');
      expect(whole.headers['accept-ranges']).toBe('bytes');
      const part = await request(server())
        .get(`/api/library/tracks/${ids.one}/stream`)
        .set('Range', 'bytes=0-3')
        .responseType('blob')
        .expect(206);
      expect(part.headers['content-range']).toBe('bytes 0-3/10');
      expect(bytes(part).toString()).toBe('fake');
      const mp3 = await request(server()).get(`/api/library/tracks/${ids.single}/stream`);
      expect(mp3.headers['content-type']).toBe('audio/mpeg');
    });

    it('refuses tracks not on disk and paths outside the library', async () => {
      await request(server()).get(`/api/library/tracks/${ids.three}/stream`).expect(404);
      await request(server()).get(`/api/library/tracks/${ids.gone}/stream`).expect(404);
      writeFileSync(join(root, 'secret.m4a'), 'secret');
      db.update(tracks).set({ filePath: '../secret.m4a' }).where(eq(tracks.id, ids.two!)).run();
      await request(server()).get(`/api/library/tracks/${ids.two}/stream`).expect(403);
      await request(server()).delete(`/api/library/tracks/${ids.two}/file`).expect(403);
      expect(existsSync(join(root, 'secret.m4a'))).toBe(true);
      db.update(tracks)
        .set({ filePath: 'Test Artist/First Light/02 Track two.m4a' })
        .where(eq(tracks.id, ids.two!))
        .run();
    });

    it('removes the file and its sidecars, marks the track deleted and records history', async () => {
      file('Test Artist/First Light/01 Track one.lrc', 'lyrics');
      await request(server()).delete(`/api/library/tracks/${ids.one}/file`).expect(204);
      expect(existsSync(join(musicDir(), 'Test Artist/First Light/01 Track one.m4a'))).toBe(false);
      expect(existsSync(join(musicDir(), 'Test Artist/First Light/01 Track one.lrc'))).toBe(false);
      expect(existsSync(join(musicDir(), 'Test Artist/First Light/02 Track two.m4a'))).toBe(true);

      const item = TrackListItem.parse(
        (await request(server()).get(`/api/library/tracks/${ids.one}`)).body,
      );
      expect(item).toMatchObject({
        status: 'skipped',
        skipReason: 'deleted_by_user',
        filePath: null,
        mimeType: null,
      });
      const [latest] = z
        .array(HistoryEntry)
        .parse((await request(server()).get('/api/activity/history?limit=1')).body);
      expect(latest).toMatchObject({
        kind: 'music',
        title: 'Track one',
        result: 'removed',
        details: 'deleted by user',
      });
      const source = Source.parse(
        (await request(server()).get(`/api/sources/${artistSource}`)).body,
      );
      expect(source.sizeBytes).toBe(20);
      // A deleted track leaves the album: 1 of 2 tracks on disk now, opening on track two.
      const albumList = z
        .array(AlbumListItem)
        .parse((await request(server()).get('/api/library/albums')).body);
      expect(albumList[0]).toMatchObject({ trackCount: 2, onDiskCount: 1, firstTrackId: ids.two });

      await request(server()).delete(`/api/library/tracks/${ids.one}/file`).expect(409);
      await request(server()).delete('/api/library/tracks/9999/file').expect(404);
    });
  });
});
