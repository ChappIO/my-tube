import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_SOURCE_OPTIONS,
  HistoryEntry,
  HomeFeed,
  LibrarySummary,
  Source,
  VideoListItem,
  VideoPage,
  and,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { ArtworkService } from '../src/artwork/artwork.service.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { channels, history, sources, videos } from '../src/database/schema.js';

/*
 * The library read endpoints, the artwork cache, Preview's streaming and Delete file, against
 * rows seeded straight into the database and files in a temp VIDEO_DIR.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));
const DAY_MS = 86_400_000;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

/** A binary response body (requested with `.responseType('blob')`). */
function bytes(response: request.Response): Buffer {
  const body: unknown = response.body;
  if (!Buffer.isBuffer(body)) throw new Error('Expected a binary body');
  return body;
}

/** The cache folder's files, relative to it. */
function cacheFiles(root: string): string[] {
  return readdirSync(join(root, 'config/cache/artwork'), { recursive: true, encoding: 'utf8' });
}

describe('Library (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const server = () => app.getHttpServer();
  const videoDir = () => join(root, 'video');

  let sourceId: number;
  let nasa: number;
  let other: number;
  /** Video ids by a short name. */
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-library-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = videoDir();
    process.env.MUSIC_DIR = join(root, 'music');
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

  function file(path: string, content = 'fake media') {
    const target = join(videoDir(), path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function seed() {
    const now = Date.now();
    sourceId = db
      .insert(sources)
      .values({
        library: 'video',
        kind: 'channel',
        youtubeId: 'UCnasa',
        url: 'https://www.youtube.com/channel/UCnasa',
        name: 'NASA',
        avatarUrl: 'https://yt3.googleusercontent.com/nasa=s256',
        // Unsubscribed, so the scheduler never checks it during the test.
        subscribed: false,
        matcher: and(),
        options: DEFAULT_SOURCE_OPTIONS,
        itemCount: 6,
        sizeBytes: 600,
      })
      .returning()
      .get().id;
    nasa = db
      .insert(channels)
      .values({
        youtubeId: 'UCnasa',
        name: 'NASA',
        avatarUrl: 'https://yt3.googleusercontent.com/nasa=s256',
        sourceId,
      })
      .returning()
      .get().id;
    other = db
      .insert(channels)
      .values({ youtubeId: 'UCother', name: 'Other' })
      .returning()
      .get().id;

    const video = (
      name: string,
      fields: Partial<typeof videos.$inferInsert> & { channelId: number },
    ) => {
      ids[name] = db
        .insert(videos)
        .values({
          youtubeId: `yt-${name}`,
          title: `Video ${name}`,
          thumbnailUrl: `https://i.ytimg.com/vi/yt-${name}/hqdefault.jpg`,
          status: 'on_disk',
          ...fields,
        })
        .returning()
        .get().id;
      if (fields.status === undefined && fields.filePath) file(fields.filePath);
    };
    const at = (daysAgo: number) => new Date(now - daysAgo * DAY_MS).toISOString();
    for (const [index, name] of ['a', 'b', 'c', 'd', 'e'].entries()) {
      video(name, {
        channelId: nasa,
        sourceId,
        publishedAt: `2026-09-0${index + 1}`,
        filePath: `NASA/Video ${name}.mp4`,
        fileSizeBytes: 100,
        downloadedAt: at(index === 4 ? 20 : index === 3 ? 1 : 0),
      });
    }
    video('mkv', {
      channelId: other,
      publishedAt: '2026-08-01',
      filePath: 'Other/Video mkv.mkv',
      fileSizeBytes: 100,
      downloadedAt: at(1),
    });
    video('wanted', { channelId: nasa, sourceId, status: 'wanted', publishedAt: '2026-09-10' });
    video('skipped', {
      channelId: nasa,
      sourceId,
      status: 'skipped',
      skipReason: 'no_match',
      publishedAt: '2026-09-11',
    });
    for (const result of ['done', 'done', 'done', 'failed']) {
      db.insert(history).values({ kind: 'video', title: 'x', result }).run();
    }
    db.insert(history).values({ kind: 'system', title: 'yt-dlp', result: 'done' }).run();
  }

  const list = async (query: string) =>
    VideoPage.parse((await request(server()).get(`/api/library/videos?${query}`).expect(200)).body)
      .items;

  describe('GET /api/library/videos', () => {
    it('lists videos on disk, newest published first, with channel and cached artwork', async () => {
      const page = VideoPage.parse(
        (await request(server()).get('/api/library/videos').expect(200)).body,
      );
      expect(page.items.map((item) => item.title)).toEqual([
        'Video e',
        'Video d',
        'Video c',
        'Video b',
        'Video a',
        'Video mkv',
      ]);
      expect(page.nextCursor).toBeNull();
      const [first] = page.items;
      expect(first).toMatchObject({
        thumbnailUrl: `/api/artwork/video/${ids.e}`,
        mimeType: 'video/mp4',
        channel: { id: nasa, name: 'NASA', avatarUrl: `/api/artwork/channel/${nasa}`, sourceId },
      });
      const mkv = page.items.at(-1)!;
      expect(mkv).toMatchObject({
        mimeType: 'video/x-matroska',
        channel: { id: other, avatarUrl: null, sourceId: null },
      });
      // No response carries a Google URL.
      expect(JSON.stringify(page)).not.toMatch(/googleusercontent|ytimg/);
    });

    it('paginates with a cursor without gaps or repeats', async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const page = VideoPage.parse(
          (await request(server()).get(`/api/library/videos?limit=4${query}`).expect(200)).body,
        );
        seen.push(...page.items.map((item) => item.title));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      expect(pages).toBe(2);
      expect(seen).toEqual(['Video e', 'Video d', 'Video c', 'Video b', 'Video a', 'Video mkv']);
    });

    it('filters by channel, source and status, and sorts by download time', async () => {
      expect((await list(`channelId=${other}`)).map((item) => item.title)).toEqual(['Video mkv']);
      expect(await list(`sourceId=${sourceId}`)).toHaveLength(5);
      expect((await list('status=wanted')).map((item) => item.title)).toEqual(['Video wanted']);
      expect(await list('status=all')).toHaveLength(8);
      expect((await list('status=skipped'))[0]).toMatchObject({ skipReason: 'no_match' });
      const byDownload = (await list('sort=downloaded')).map((item) => item.title);
      expect(byDownload.at(-1)).toBe('Video e');
      expect(byDownload.slice(-3, -1).toSorted()).toEqual(['Video d', 'Video mkv']);
    });

    it('rejects bad queries', async () => {
      await request(server()).get('/api/library/videos?limit=0').expect(400);
      await request(server()).get('/api/library/videos?status=bogus').expect(400);
      const bad = await request(server()).get('/api/library/videos?cursor=nonsense').expect(400);
      expect(bad.body).toMatchObject({ message: 'Invalid cursor' });
    });

    it('GET /api/library/videos/:id returns one video', async () => {
      const item = VideoListItem.parse(
        (await request(server()).get(`/api/library/videos/${ids.a}`).expect(200)).body,
      );
      expect(item).toMatchObject({ title: 'Video a', filePath: 'NASA/Video a.mp4' });
      await request(server()).get('/api/library/videos/9999').expect(404);
    });
  });

  it('GET /api/library/summary counts the video library', async () => {
    const summary = LibrarySummary.parse(
      (await request(server()).get('/api/library/summary').expect(200)).body,
    );
    expect(summary).toEqual({
      videos: { channels: 1, playlists: 0, videos: 6, sizeBytes: 600 },
      music: { artists: 0, albums: 0, playlists: 0, artistSubscriptions: 0 },
    });
  });

  it('GET /api/library/home groups recent downloads by local day with the stats', async () => {
    const feed = HomeFeed.parse(
      (await request(server()).get('/api/library/home?tz=UTC').expect(200)).body,
    );
    expect(feed.stats).toEqual({
      activeDownloads: 0,
      downloadedAllTime: 3,
      librarySizeBytes: 600,
    });
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
    expect(feed.groups.map((group) => group.day)).toEqual([today, yesterday]);
    expect(feed.groups[0]!.items.map((item) => item.title).toSorted()).toEqual([
      'Video a',
      'Video b',
      'Video c',
    ]);
    expect(feed.groups[1]!.items.map((item) => item.title).toSorted()).toEqual([
      'Video d',
      'Video mkv',
    ]);
    expect(feed.groups[0]!.items[0]).toMatchObject({ kind: 'video', channel: { name: 'NASA' } });
    // The 20-day-old download is outside the default 14 days, inside 30.
    const month = HomeFeed.parse(
      (await request(server()).get('/api/library/home?days=30&tz=UTC').expect(200)).body,
    );
    expect(month.groups).toHaveLength(3);
    await request(server()).get('/api/library/home?tz=Mars/Olympus').expect(400);
  });

  describe('GET /api/artwork/:kind/:id', () => {
    it('downloads a remote image once and serves it from the cache', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => {
        return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
      });
      vi.stubGlobal('fetch', fetchMock);

      const url = `/api/artwork/channel/${nasa}`;
      const [first, concurrent] = await Promise.all([
        request(server()).get(url).responseType('blob').expect(200),
        request(server()).get(url).responseType('blob').expect(200),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0]!;
      expect(calledUrl).toBe('https://yt3.googleusercontent.com/nasa=s256');
      expect(new Headers(init?.headers).get('user-agent')).toMatch(/^MyTube\//);
      expect(first.headers['content-type']).toBe('image/png');
      expect(first.headers['cache-control']).toBe('public, max-age=86400');
      expect(first.headers.etag).toBeTruthy();
      expect(Buffer.compare(bytes(first), PNG)).toBe(0);
      expect(Buffer.compare(bytes(concurrent), PNG)).toBe(0);
      expect(existsSync(join(root, 'config/cache/artwork/channel', `${nasa}.png`))).toBe(true);

      // A hit does not fetch again, and a matching ETag is a 304.
      const again = await request(server()).get(url).expect(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await request(server()).get(url).set('If-None-Match', again.headers.etag!).expect(304);

      // The Source DTO points at the same cached avatar.
      const source = Source.parse(
        (await request(server()).get(`/api/sources/${sourceId}`).expect(200)).body,
      );
      expect(source.avatarUrl).toBe(url);
    });

    it('prefers the sidecar thumbnail of a video on disk', async () => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal('fetch', fetchMock);
      file('NASA/Video a.jpg', 'sidecar jpg');
      const response = await request(server())
        .get(`/api/artwork/video/${ids.a}`)
        .responseType('blob')
        .expect(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(bytes(response).toString()).toBe('sidecar jpg');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers 503 with Retry-After while Google rate-limits, and remembers it briefly', async () => {
      const fetchMock = vi.fn<typeof fetch>(async () => new Response('slow down', { status: 429 }));
      vi.stubGlobal('fetch', fetchMock);
      const url = `/api/artwork/video/${ids.b}`;
      const response = await request(server()).get(url).expect(503);
      expect(response.headers['retry-after']).toBe('5');
      await request(server()).get(url).expect(503);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Nothing was cached for the failure.
      expect(existsSync(join(root, 'config/cache/artwork/video', `${ids.b}.jpg`))).toBe(false);
    });

    it('answers 404 for missing rows, missing art and remote 404s, 400 for unknown kinds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async () => new Response('gone', { status: 404 })),
      );
      const missing = await request(server()).get(`/api/artwork/video/${ids.c}`).expect(404);
      expect(missing.headers['retry-after']).toBeUndefined();
      await request(server()).get(`/api/artwork/channel/${other}`).expect(404);
      await request(server()).get('/api/artwork/channel/9999').expect(404);
      await request(server()).get('/api/artwork/source/1').expect(400);
      await request(server()).get('/api/artwork/video/abc').expect(400);
    });

    it('prunes the cache to its size, least recently served first', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(
          async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
        ),
      );
      await request(server()).get(`/api/artwork/video/${ids.d}`).expect(200);
      const artwork = app.get(ArtworkService);
      expect(cacheFiles(root)).toContain(`video/${ids.d}.jpg`);
      // The channel avatar was served longest ago, so it goes first.
      expect(artwork.prune(PNG.length)).toBe(1);
      expect(cacheFiles(root)).not.toContain(`channel/${nasa}.png`);
      expect(cacheFiles(root)).toContain(`video/${ids.d}.jpg`);
    });
  });

  describe('GET /api/library/videos/:id/stream', () => {
    it('serves the file with range support and the container type', async () => {
      const whole = await request(server())
        .get(`/api/library/videos/${ids.a}/stream`)
        .responseType('blob')
        .expect(200);
      expect(whole.headers['content-type']).toBe('video/mp4');
      expect(whole.headers['accept-ranges']).toBe('bytes');
      expect(bytes(whole).toString()).toBe('fake media');

      const part = await request(server())
        .get(`/api/library/videos/${ids.a}/stream`)
        .set('Range', 'bytes=0-3')
        .responseType('blob')
        .expect(206);
      expect(part.headers['content-range']).toBe('bytes 0-3/10');
      expect(bytes(part).toString()).toBe('fake');

      const mkv = await request(server()).get(`/api/library/videos/${ids.mkv}/stream`).expect(200);
      expect(mkv.headers['content-type']).toBe('video/x-matroska');
    });

    it('refuses videos not on disk and paths outside the library', async () => {
      await request(server()).get(`/api/library/videos/${ids.wanted}/stream`).expect(404);
      await request(server()).get('/api/library/videos/9999/stream').expect(404);
      writeFileSync(join(root, 'secret.mp4'), 'secret');
      db.update(videos).set({ filePath: '../secret.mp4' }).where(eq(videos.id, ids.c!)).run();
      await request(server()).get(`/api/library/videos/${ids.c}/stream`).expect(403);
      await request(server()).delete(`/api/library/videos/${ids.c}/file`).expect(403);
      expect(existsSync(join(root, 'secret.mp4'))).toBe(true);
      db.update(videos).set({ filePath: 'NASA/Video c.mp4' }).where(eq(videos.id, ids.c!)).run();
    });
  });

  describe('DELETE /api/library/videos/:id/file', () => {
    it('removes the file and sidecars, marks the video deleted and records history', async () => {
      file('NASA/Video b.jpg', 'jpg');
      file('NASA/Video b.en.vtt', 'vtt');
      await request(server()).delete(`/api/library/videos/${ids.b}/file`).expect(204);
      for (const name of ['Video b.mp4', 'Video b.jpg', 'Video b.en.vtt']) {
        expect(existsSync(join(videoDir(), 'NASA', name))).toBe(false);
      }
      expect(existsSync(join(videoDir(), 'NASA', 'Video a.mp4'))).toBe(true);

      const item = VideoListItem.parse(
        (await request(server()).get(`/api/library/videos/${ids.b}`).expect(200)).body,
      );
      expect(item).toMatchObject({
        status: 'skipped',
        skipReason: 'deleted_by_user',
        filePath: null,
        fileSizeBytes: null,
        mimeType: null,
      });
      const listed = VideoPage.parse((await request(server()).get('/api/library/videos')).body);
      expect(listed.items.map((row) => row.id)).not.toContain(ids.b);

      const [latest] = z
        .array(HistoryEntry)
        .parse((await request(server()).get('/api/activity/history?limit=1')).body);
      expect(latest).toMatchObject({
        kind: 'video',
        title: 'Video b',
        result: 'removed',
        details: 'deleted by user',
      });
      const source = Source.parse((await request(server()).get(`/api/sources/${sourceId}`)).body);
      expect(source.sizeBytes).toBe(500);
      expect(source.itemCount).toBe(5);

      await request(server()).delete(`/api/library/videos/${ids.b}/file`).expect(409);
      await request(server()).delete('/api/library/videos/9999/file').expect(404);
    });
  });
});
