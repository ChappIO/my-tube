import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_SOURCE_OPTIONS, TRACK_SORTS, TrackPage, and } from '@mytube/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { albums, artists, sources, tracks } from '../src/database/schema.js';

/*
 * `GET /api/library/tracks` (the Tracks tab) against rows seeded straight into the database:
 * filters, the text match over title, artist and album, every sort in both directions, the
 * cursor pages and the two totals.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));
const DAY = 86_400_000;

interface Seed {
  title: string;
  artist: string;
  album: string | null;
  length: number | null;
  /** Days since the download; null for never downloaded. */
  addedDaysAgo: number | null;
  status: 'wanted' | 'downloading' | 'on_disk' | 'missing' | 'skipped';
}

// Titles are unique, so a list of titles identifies the rows and their order.
const SEEDS: Seed[] = [
  {
    title: 'Nakamarra',
    artist: 'Hiatus Kaiyote',
    album: 'Tawk Tomahawk',
    length: 245,
    addedDaysAgo: 1,
    status: 'on_disk',
  },
  {
    title: 'Red Room',
    artist: 'Hiatus Kaiyote',
    album: 'Choose Your Weapon',
    length: 262,
    addedDaysAgo: 2,
    status: 'on_disk',
  },
  {
    title: 'Telescope',
    artist: 'Hiatus Kaiyote',
    album: 'Mood Valiant',
    length: 301,
    addedDaysAgo: 40,
    status: 'missing',
  },
  {
    title: 'Chivalry Is Not Dead',
    artist: 'Hiatus Kaiyote',
    album: 'Mood Valiant',
    length: null,
    addedDaysAgo: null,
    status: 'wanted',
  },
  {
    title: 'Écoute',
    artist: 'Émilie Simon',
    album: null,
    length: 180,
    addedDaysAgo: 5,
    status: 'on_disk',
  },
  {
    title: 'Blue Train',
    artist: 'John Coltrane',
    album: 'Blue Train',
    length: 643,
    addedDaysAgo: 60,
    status: 'on_disk',
  },
  {
    title: 'Downloading Now',
    artist: 'John Coltrane',
    album: 'Blue Train',
    length: 546,
    addedDaysAgo: null,
    status: 'downloading',
  },
  {
    title: 'Skipped Song',
    artist: 'John Coltrane',
    album: 'Blue Train',
    length: 100,
    addedDaysAgo: 3,
    status: 'skipped',
  },
];

const titles = (page: TrackPage) => page.items.map((item) => item.title);
const inLibrary = SEEDS.filter((item) => item.status !== 'skipped');

describe('Tracks list (e2e)', () => {
  let app: INestApplication;
  let root: string;
  let db: Database;
  const now = Date.now();

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-tracks-e2e-'));
    process.env.CONFIG_DIR = join(root, 'config');
    process.env.VIDEO_DIR = join(root, 'video');
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

  function seed() {
    const stamp = new Date(now).toISOString();
    const sourceId = db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: 'UChiatus',
        url: 'https://music.youtube.com/channel/UChiatus',
        name: 'Hiatus Kaiyote',
        subscribed: false,
        matcher: and(),
        options: DEFAULT_SOURCE_OPTIONS,
        lastCheckedAt: stamp,
        lastRevalidatedAt: stamp,
      })
      .returning()
      .get().id;
    const artistIds = new Map<string, number>();
    const albumIds = new Map<string, number>();
    for (const item of SEEDS) {
      let artistId = artistIds.get(item.artist);
      if (artistId === undefined) {
        artistId = db.insert(artists).values({ name: item.artist }).returning().get().id;
        artistIds.set(item.artist, artistId);
      }
      let albumId: number | null = null;
      if (item.album !== null) {
        albumId = albumIds.get(item.album) ?? null;
        if (albumId === null) {
          albumId = db.insert(albums).values({ artistId, title: item.album }).returning().get().id;
          albumIds.set(item.album, albumId);
        }
      }
      const downloadedAt =
        item.addedDaysAgo === null ? null : new Date(now - item.addedDaysAgo * DAY).toISOString();
      db.insert(tracks)
        .values({
          artistId,
          albumId,
          sourceId,
          youtubeId: `yt-${item.title}`,
          title: item.title,
          durationSeconds: item.length,
          status: item.status,
          skipReason: item.status === 'skipped' ? 'no_match' : null,
          filePath: item.status === 'on_disk' ? `${item.artist}/${item.title}.m4a` : null,
          downloadedAt,
        })
        .run();
    }
  }

  async function list(query: Record<string, string | number> = {}): Promise<TrackPage> {
    const response = await request(app.getHttpServer()).get('/api/library/tracks').query(query);
    expect(response.status).toBe(200);
    return TrackPage.parse(response.body);
  }

  const sorted = async (sort: string, dir: string) => titles(await list({ sort, dir }));
  const status = async (query: Record<string, string>) =>
    (await request(app.getHttpServer()).get('/api/library/tracks').query(query)).status;

  it('lists the library newest download first, never-downloaded last, with both totals', async () => {
    const page = await list();
    expect(titles(page)).toEqual([
      'Nakamarra',
      'Red Room',
      'Écoute',
      'Telescope',
      'Blue Train',
      // No download time: last, newest id first.
      'Downloading Now',
      'Chivalry Is Not Dead',
    ]);
    expect(page.total).toBe(inLibrary.length);
    expect(page.libraryTotal).toBe(inLibrary.length);
    expect(page.nextCursor).toBeNull();
    const first = page.items[0]!;
    expect(first.artist.name).toBe('Hiatus Kaiyote');
    expect(first.album?.title).toBe('Tawk Tomahawk');
    expect(first.mimeType).toBe('audio/mp4');
  });

  it('filters to the tracks not on disk and to the last 30 days', async () => {
    const missing = await list({ filter: 'missing', sort: 'title', dir: 'asc' });
    expect(titles(missing)).toEqual(['Chivalry Is Not Dead', 'Downloading Now', 'Telescope']);
    expect(missing.total).toBe(3);
    expect(missing.libraryTotal).toBe(inLibrary.length);

    const recent = await list({ filter: 'recent' });
    expect(titles(recent)).toEqual(['Nakamarra', 'Red Room', 'Écoute']);
    expect(recent.total).toBe(3);
  });

  it('matches q over title, artist and album, ignoring case and accents', async () => {
    const q = async (text: string) => titles(await list({ q: text, sort: 'title', dir: 'asc' }));
    expect(await q('TELE')).toEqual(['Telescope']);
    expect(await q('coltrane')).toEqual(['Blue Train', 'Downloading Now']);
    expect(await q('valiant')).toEqual(['Chivalry Is Not Dead', 'Telescope']);
    expect(await q('emilie')).toEqual(['Écoute']);
    expect(await q('ecoute')).toEqual(['Écoute']);
    expect(await q('nothing like this')).toEqual([]);
    // Blank text is no filter; q combines with the filter and counts as the total.
    expect((await list({ q: '   ' })).total).toBe(inLibrary.length);
    const combined = await list({ q: 'hiatus', filter: 'missing' });
    expect(titles(combined).toSorted()).toEqual(['Chivalry Is Not Dead', 'Telescope']);
    expect(combined.total).toBe(2);
    expect(combined.libraryTotal).toBe(inLibrary.length);
  });

  it('sorts by every column both ways, rows without a value last', async () => {
    expect(await sorted('title', 'asc')).toEqual([
      'Blue Train',
      'Chivalry Is Not Dead',
      'Downloading Now',
      'Écoute',
      'Nakamarra',
      'Red Room',
      'Telescope',
    ]);
    expect(await sorted('title', 'desc')).toEqual([
      'Telescope',
      'Red Room',
      'Nakamarra',
      'Écoute',
      'Downloading Now',
      'Chivalry Is Not Dead',
      'Blue Train',
    ]);
    // Ties (one artist) go by id in the sort's direction.
    expect(await sorted('artist', 'asc')).toEqual([
      'Écoute',
      'Nakamarra',
      'Red Room',
      'Telescope',
      'Chivalry Is Not Dead',
      'Blue Train',
      'Downloading Now',
    ]);
    expect(await sorted('artist', 'desc')).toEqual([
      'Downloading Now',
      'Blue Train',
      'Chivalry Is Not Dead',
      'Telescope',
      'Red Room',
      'Nakamarra',
      'Écoute',
    ]);
    // Écoute has no album: last both ways.
    expect(await sorted('album', 'asc')).toEqual([
      'Blue Train',
      'Downloading Now',
      'Red Room',
      'Telescope',
      'Chivalry Is Not Dead',
      'Nakamarra',
      'Écoute',
    ]);
    expect(await sorted('album', 'desc')).toEqual([
      'Nakamarra',
      'Chivalry Is Not Dead',
      'Telescope',
      'Red Room',
      'Downloading Now',
      'Blue Train',
      'Écoute',
    ]);
    // Chivalry has no length: last both ways.
    expect(await sorted('length', 'asc')).toEqual([
      'Écoute',
      'Nakamarra',
      'Red Room',
      'Telescope',
      'Downloading Now',
      'Blue Train',
      'Chivalry Is Not Dead',
    ]);
    expect(await sorted('length', 'desc')).toEqual([
      'Blue Train',
      'Downloading Now',
      'Telescope',
      'Red Room',
      'Nakamarra',
      'Écoute',
      'Chivalry Is Not Dead',
    ]);
    expect(await sorted('added', 'asc')).toEqual([
      'Blue Train',
      'Telescope',
      'Écoute',
      'Red Room',
      'Nakamarra',
      'Chivalry Is Not Dead',
      'Downloading Now',
    ]);
  });

  it('pages with the cursor through every sort without gaps or repeats', async () => {
    for (const sort of TRACK_SORTS) {
      for (const dir of ['asc', 'desc']) {
        const whole = titles(await list({ sort, dir }));
        const paged: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
          const page: TrackPage = await list({
            sort,
            dir,
            limit: 2,
            ...(cursor ? { cursor } : {}),
          });
          expect(page.total).toBe(inLibrary.length);
          paged.push(...titles(page));
          cursor = page.nextCursor;
          pages += 1;
        } while (cursor !== null);
        expect(paged, `${sort} ${dir}`).toEqual(whole);
        expect(pages).toBe(Math.ceil(inLibrary.length / 2));
      }
    }
  });

  it('refuses a bad query or cursor', async () => {
    expect(await status({ filter: 'lost' })).toBe(400);
    expect(await status({ sort: 'rating' })).toBe(400);
    expect(await status({ dir: 'up' })).toBe(400);
    expect(await status({ limit: '0' })).toBe(400);
    expect(await status({ cursor: 'not-a-cursor' })).toBe(400);
    expect(await status({ q: 'x'.repeat(201) })).toBe(400);
  });
});
