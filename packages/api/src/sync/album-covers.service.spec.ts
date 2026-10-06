import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_MUSIC_MATCHER, DEFAULT_SOURCE_OPTIONS } from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { ArtworkService } from '../artwork/artwork.service.js';
import { AppConfig } from '../config/app-config.js';
import { albums, artists, artworkCache, sources, tracks } from '../database/schema.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { AlbumCoverService, COVER_REFRESH_COOLDOWN_MS } from './album-covers.service.js';
import { SyncService } from './sync.service.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
const ARTIST = 'UCartist000000000000001';
/** The signed cover of list-OLAK5uy_album1.json. */
const FRESH_COVER = 'https://i9.ytimg.com/s_p/OLAK5uy_album1/sddefault.jpg?sqp=signed';
const STALE_COVER = 'https://i9.ytimg.com/s_p/OLAK5uy_album1/sddefault.jpg?sqp=expired&rs=old';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mytube-covers-'));
  const harness = createJobsHarness();
  const config = new AppConfig({
    CONFIG_DIR: join(root, 'config'),
    VIDEO_DIR: join(root, 'video'),
    MUSIC_DIR: join(root, 'music'),
  });
  const artwork = new ArtworkService(harness.db, config);
  const runner = new YtdlpRunner({ path: () => FAKE });
  const covers = new AlbumCoverService(harness.db, runner, harness.settings, artwork);
  const sync = new SyncService(harness.db, runner, harness.settings, harness.jobs, covers);
  const album = () =>
    harness.db.select().from(albums).where(eq(albums.youtubeId, 'OLAK5uy_album1')).get();
  const cached = (albumId: number) =>
    harness.db
      .select()
      .from(artworkCache)
      .where(eq(artworkCache.key, `album/${albumId}`))
      .get();
  return { ...harness, root, artwork, covers, sync, album, cached };
}

/** `fetch` answering a PNG for `okUrls` and 404 for anything else. */
function stubFetch(...okUrls: string[]) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return okUrls.includes(url)
      ? new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
      : new Response('gone', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AlbumCoverService', () => {
  let root: string | null = null;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it('downloads the cover of a freshly recorded album during the check', async () => {
    const t = setup();
    root = t.root;
    const fetchMock = stubFetch(
      FRESH_COVER,
      'https://i9.ytimg.com/s_p/OLAK5uy_single1/sddefault.jpg?sqp=signed',
    );
    const source = t.db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: ARTIST,
        url: `https://music.youtube.com/channel/${ARTIST}`,
        name: 'Test Artist',
        matcher: DEFAULT_MUSIC_MATCHER,
        options: DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    t.db
      .insert(artists)
      .values({ youtubeId: ARTIST, name: 'Test Artist', sourceId: source.id })
      .run();

    await t.sync.checkSource(source.id);
    // The warm-up runs in the background; let its fetches finish.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const album = t.album()!;
    await vi.waitFor(() => expect(t.cached(album.id)).toMatchObject({ sourceUrl: FRESH_COVER }));
    expect(existsSync(join(t.root, 'config/cache/artwork/album', `${album.id}.png`))).toBe(true);
  });

  it('lists an album again when its stored cover answers 404, and serves the sidecar meanwhile', async () => {
    const t = setup();
    root = t.root;
    const fetchMock = stubFetch(FRESH_COVER);
    const artistId = t.db
      .insert(artists)
      .values({ youtubeId: ARTIST, name: 'Test Artist' })
      .returning()
      .get().id;
    const albumId = t.db
      .insert(albums)
      .values({
        artistId,
        youtubeId: 'OLAK5uy_album1',
        title: 'First Light',
        coverUrl: STALE_COVER,
        trackCount: 3,
      })
      .returning()
      .get().id;
    const file = 'Test Artist/First Light/01 Heatwave.m4a';
    t.db
      .insert(tracks)
      .values({
        artistId,
        albumId,
        youtubeId: 'trk00000001',
        title: 'Heatwave',
        trackNumber: 1,
        status: 'on_disk',
        filePath: file,
      })
      .run();
    mkdirSync(join(t.root, 'music', dirname(file)), { recursive: true });
    writeFileSync(join(t.root, 'music', file), 'audio');
    writeFileSync(join(t.root, 'music', file.replace(/m4a$/, 'jpg')), 'sidecar');

    // The stale cover: the sidecar is served and the refresh queued.
    const served = await t.artwork.locate('album', albumId);
    expect(served.path).toBe(join(t.root, 'music', file.replace(/m4a$/, 'jpg')));
    expect(fetchMock).toHaveBeenCalledWith(STALE_COVER, expect.anything());
    await t.covers.idle();

    expect(t.album()).toMatchObject({ coverUrl: FRESH_COVER });
    expect(fetchMock).toHaveBeenLastCalledWith(FRESH_COVER, expect.anything());
    expect(t.cached(albumId)).toMatchObject({ sourceUrl: FRESH_COVER, contentType: 'image/png' });
    const fresh = await t.artwork.locate('album', albumId);
    expect(fresh.path).toBe(join(t.root, 'config/cache/artwork/album', `${albumId}.png`));

    // Refreshing again within the cooldown lists nothing; after it, it does (the cover is
    // already cached, so nothing is fetched again).
    t.db.update(albums).set({ coverUrl: STALE_COVER }).where(eq(albums.id, albumId)).run();
    await t.covers.refresh(albumId);
    expect(t.album()).toMatchObject({ coverUrl: STALE_COVER });
    await t.covers.refresh(albumId, Date.now() + COVER_REFRESH_COOLDOWN_MS);
    expect(t.album()).toMatchObject({ coverUrl: FRESH_COVER });
  });

  it('does nothing for an album without a playlist id or without a track on disk', async () => {
    const t = setup();
    root = t.root;
    stubFetch();
    const artistId = t.db
      .insert(artists)
      .values({ youtubeId: ARTIST, name: 'Test Artist' })
      .returning()
      .get().id;
    const grouped = t.db
      .insert(albums)
      .values({ artistId, title: 'Uploads', coverUrl: STALE_COVER })
      .returning()
      .get().id;
    await expect(t.artwork.locate('album', grouped)).rejects.toThrow(/No artwork/);
    await t.covers.idle();
    expect(t.db.select().from(albums).where(eq(albums.id, grouped)).get()?.coverUrl).toBe(
      STALE_COVER,
    );
  });
});
