import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DEFAULT_MUSIC_MATCHER,
  DEFAULT_SOURCE_OPTIONS,
  and,
  not,
  type Matcher,
  type SourceOptions,
} from '@mytube/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createJobsHarness } from '../../test/jobs-harness.js';
import { AppConfig } from '../config/app-config.js';
import {
  albums,
  artists,
  history,
  jobs as jobsTable,
  playlistItems,
  playlists,
  sources,
  tracks,
} from '../database/schema.js';
import type { SourceEntry } from '../ytdlp/metadata.js';
import { YtdlpRunner } from '../ytdlp/ytdlp-runner.js';
import { artistName, groupByAlbum, releasesUrl } from './music-sync.js';
import { RevalidationService } from './revalidation.service.js';
import { SyncService } from './sync.service.js';

const FAKE = join(import.meta.dirname, '../../test/fixtures/fake-yt-dlp');
// The music fixtures in test/fixtures/ytdlp/music: the artist's releases are the album
// "First Light" (Heatwave, Low Tide, Long Night (Live)) and the single "Heatwave", whose one
// track is the album's first.
const ARTIST = 'UCartist000000000000001';
const PLAYLIST = 'PLmusic0001';
const NOW = new Date('2026-09-24T12:00:00Z');

function entry(id: string, album: string | null, title = id): SourceEntry {
  return {
    kind: 'video',
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    duration: 200,
    uploadDate: null,
    timestamp: null,
    liveStatus: null,
    availability: null,
    isShort: false,
    tab: null,
    channelId: null,
    channel: null,
    thumbnails: [],
    expectedStreams: [],
    expectedBytes: null,
    music: {
      track: null,
      artist: null,
      album,
      albumArtist: null,
      releaseYear: null,
      releaseDate: null,
      trackNumber: null,
      discNumber: null,
    },
  };
}

describe('music sync helpers', () => {
  it('groups a fallback listing by album, keeping the listing order', () => {
    const groups = groupByAlbum([
      entry('a', 'Second'),
      entry('b', null),
      entry('c', 'First'),
      entry('d', 'Second'),
      entry('e', ' '),
    ]);
    expect(groups.map((group) => [group.album, group.entries.map((item) => item.id)])).toEqual([
      ['Second', ['a', 'd']],
      [null, ['b', 'e']],
      ['First', ['c']],
    ]);
  });

  it('cleans upload titles before the rules see them', async () => {
    const harness = createJobsHarness(NOW.toISOString());
    const sync = new SyncService(
      harness.db,
      new YtdlpRunner({ path: () => FAKE }),
      harness.settings,
      harness.jobs,
    );
    const source = harness.db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: ARTIST,
        url: `https://music.youtube.com/channel/${ARTIST}`,
        name: 'Test Artist',
        matcher: and({ type: 'title_contains', text: 'Official' }),
        options: DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    process.env.FAKE_YTDLP_NO_RELEASES = '1';
    // uploads.json: "Heatwave (Official Video)" is recorded as "Heatwave" and so does not match.
    try {
      await sync.checkSource(source.id);
    } finally {
      delete process.env.FAKE_YTDLP_NO_RELEASES;
    }
    const row = harness.db.select().from(tracks).where(eq(tracks.youtubeId, 'upl00000001')).get();
    expect(row).toMatchObject({ title: 'Heatwave', status: 'skipped' });
  });

  it('names artists after their Topic channels and builds the releases URL', () => {
    expect(artistName('Khruangbin - Topic')).toBe('Khruangbin');
    expect(artistName('Khruangbin')).toBe('Khruangbin');
    expect(artistName(null)).toBeNull();
    expect(releasesUrl(ARTIST)).toBe(`https://www.youtube.com/channel/${ARTIST}/releases`);
  });
});

function setup() {
  const harness = createJobsHarness(NOW.toISOString());
  const sync = new SyncService(
    harness.db,
    new YtdlpRunner({ path: () => FAKE }),
    harness.settings,
    harness.jobs,
  );
  const addArtist = (matcher: Matcher = DEFAULT_MUSIC_MATCHER) => {
    const source = harness.db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'artist',
        youtubeId: ARTIST,
        url: `https://music.youtube.com/channel/${ARTIST}`,
        name: 'Test Artist',
        matcher,
        options: DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    harness.db
      .insert(artists)
      .values({ youtubeId: ARTIST, name: 'Test Artist', sourceId: source.id })
      .run();
    return source;
  };
  const addPlaylist = (matcher: Matcher = DEFAULT_MUSIC_MATCHER, options?: SourceOptions) => {
    const source = harness.db
      .insert(sources)
      .values({
        library: 'music',
        kind: 'playlist',
        youtubeId: PLAYLIST,
        url: `https://music.youtube.com/playlist?list=${PLAYLIST}`,
        name: 'Road Trip',
        matcher,
        options: options ?? DEFAULT_SOURCE_OPTIONS,
      })
      .returning()
      .get();
    harness.db
      .insert(playlists)
      .values({ library: 'music', youtubeId: PLAYLIST, name: 'Road Trip', sourceId: source.id })
      .run();
    return source;
  };
  const track = (youtubeId: string) =>
    harness.db.select().from(tracks).where(eq(tracks.youtubeId, youtubeId)).get();
  const downloads = () =>
    harness.db.select().from(jobsTable).where(eq(jobsTable.type, 'download')).all();
  return { ...harness, sync, addArtist, addPlaylist, track, downloads };
}

describe('MusicSync (fake binary)', () => {
  let root: string | null = null;

  afterEach(() => {
    delete process.env.FAKE_YTDLP_NO_RELEASES;
    delete process.env.FAKE_YTDLP_BOT_CHECK;
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it('records an artist’s releases as albums with numbered tracks and queues them', async () => {
    const { sync, addArtist, track, downloads, db } = setup();
    const source = addArtist();
    const lines: string[] = [];

    const result = await sync.checkSource(source.id, { log: (line) => lines.push(line) });

    expect(result).toMatchObject({ entries: 4, added: 3, wanted: 3, queued: 3 });
    const album = db.select().from(albums).where(eq(albums.youtubeId, 'OLAK5uy_album1')).get();
    expect(album).toMatchObject({
      title: 'First Light',
      trackCount: 3,
      year: null,
      // The signed 640 px cover: the unsigned 1200 px one answers 404.
      coverUrl: 'https://i9.ytimg.com/s_p/OLAK5uy_album1/sddefault.jpg?sqp=signed',
    });
    // The single is recorded (a one-track album), but its track stays with the album.
    const single = db.select().from(albums).where(eq(albums.youtubeId, 'OLAK5uy_single1')).get();
    expect(single).toMatchObject({ title: 'Heatwave', trackCount: 1 });
    expect(track('trk00000001')).toMatchObject({
      albumId: album?.id,
      trackNumber: 1,
      status: 'wanted',
      sourceId: source.id,
      durationSeconds: 201,
      title: 'Heatwave',
    });
    expect(track('trk00000003')).toMatchObject({ albumId: album?.id, trackNumber: 3 });

    const jobs = downloads();
    expect(jobs.map((job) => job.dedupeKey)).toEqual([
      'track:trk00000001',
      'track:trk00000002',
      'track:trk00000003',
    ]);
    expect(jobs[0]?.payload).toMatchObject({
      title: 'Heatwave',
      subtitle: 'Test Artist',
      historyKind: 'music',
      trackId: track('trk00000001')?.id,
      detail: 'm4a',
    });
    // The first check lists 200 releases, then each album on YouTube Music.
    expect(lines.find((line) => line.includes('/releases'))).toContain('--playlist-items 1:200');
    expect(
      lines.some((line) => line.includes('music.youtube.com/playlist?list=OLAK5uy_album1')),
    ).toBe(true);
  });

  it('keeps the cookies for the rest of a check once a bot check asked for them', async () => {
    const { sync, addArtist, settings } = setup();
    settings.patch({ network: { cookiesFile: '/config/cookies.txt' } });
    process.env.FAKE_YTDLP_BOT_CHECK = '1';
    const source = addArtist();
    const lines: string[] = [];
    const result = await sync.checkSource(source.id, { log: (line) => lines.push(line) });
    expect(result.synced).toBe(true);
    const commands = lines.filter((line) => line.startsWith('$ '));
    // The releases listing: without cookies, the bot check, then with them.
    expect(commands[0]).toContain('/releases');
    expect(commands[0]).not.toContain('--cookies');
    expect(commands[1]).toContain('/releases');
    expect(commands[1]).toContain('--cookies <redacted>');
    // Every album listing after it starts with the cookies: no second retry.
    const albums = commands.slice(2);
    expect(albums.length).toBeGreaterThan(1);
    for (const command of albums) expect(command).toContain('--cookies <redacted>');
    expect(lines.filter((line) => line.startsWith('retrying with cookies:'))).toHaveLength(1);
  });

  it('fetches only new releases on later checks', async () => {
    const { sync, addArtist, downloads } = setup();
    const source = addArtist();
    await sync.checkSource(source.id);
    const lines: string[] = [];
    const again = await sync.checkSource(source.id, { log: (line) => lines.push(line) });
    expect(again).toMatchObject({ entries: 0, added: 0, queued: 0 });
    expect(lines).toContain('2 releases, 0 not fetched before');
    expect(lines.find((line) => line.includes('/releases'))).toContain('--playlist-items 1:60');
    expect(downloads()).toHaveLength(3);
  });

  it('evaluates the source’s rules on each track', async () => {
    const { sync, addArtist, track } = setup();
    const source = addArtist(
      and(
        not({ type: 'title_matches', pattern: '\\blive\\b' }),
        { type: 'duration_under', seconds: 300 },
        // Music has no shorts: this condition always holds.
        not({ type: 'is_short' }),
      ),
    );
    const result = await sync.checkSource(source.id);
    expect(result).toMatchObject({ wanted: 2, queued: 2 });
    expect(track('trk00000002')?.status).toBe('wanted');
    expect(track('trk00000003')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
  });

  it('falls back to the uploads without a Releases tab, leaving shorts out', async () => {
    process.env.FAKE_YTDLP_NO_RELEASES = '1';
    const { sync, addArtist, track, db } = setup();
    const source = addArtist();
    const lines: string[] = [];
    const result = await sync.checkSource(source.id, { log: (line) => lines.push(line) });
    expect(result).toMatchObject({ added: 2, wanted: 2, queued: 2 });
    expect(lines.some((line) => line.startsWith('No releases tab'))).toBe(true);
    expect(track('upl00000001')).toMatchObject({
      albumId: null,
      trackNumber: null,
      publishedAt: '2025-09-04',
    });
    expect(track('upl00000002')).toBeUndefined();
    expect(db.select().from(albums).all()).toHaveLength(0);
  });

  it('records a music playlist in order under the uploaders’ artists', async () => {
    const { sync, addPlaylist, track, downloads, db } = setup();
    const source = addPlaylist(and({ type: 'in_playlist_position_under', position: 3 }), {
      ...DEFAULT_SOURCE_OPTIONS,
      syncOrder: true,
    });
    const result = await sync.checkSource(source.id);
    expect(result).toMatchObject({ entries: 3, added: 3, wanted: 2, queued: 2 });

    const band = db.select().from(artists).where(eq(artists.name, 'Band One')).get();
    expect(band).toMatchObject({ youtubeId: 'UCbandone0000000000001', sourceId: null });
    expect(track('pls00000001')).toMatchObject({ artistId: band?.id, albumId: null });
    expect(track('pls00000003')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });

    const items = db.select().from(playlistItems).orderBy(playlistItems.position).all();
    expect(items.map((item) => [item.position, item.trackId, item.videoId])).toEqual([
      [1, track('pls00000001')?.id, null],
      [2, track('trk00000002')?.id, null],
      [3, track('pls00000003')?.id, null],
    ]);
    expect(db.select().from(playlists).get()?.itemCount).toBe(3);
    // "Sync in playlist order" numbers the files by position.
    expect(downloads().map((job) => job.payload.position)).toEqual([1, 2]);
  });

  it('keeps a track another source wants: a match wins', async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-music-claims-'));
    const { sync, addArtist, addPlaylist, track, db, jobs, history: historyService } = setup();
    const artist = addArtist(and(not({ type: 'title_contains', text: 'Low Tide' })));
    await sync.checkSource(artist.id);
    expect(track('trk00000002')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });

    // The playlist lists the same track and wants it.
    const playlist = addPlaylist();
    await sync.checkSource(playlist.id);
    expect(track('trk00000002')).toMatchObject({ status: 'wanted', sourceId: artist.id });

    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const revalidation = new RevalidationService(db, config, historyService, jobs, sync);
    expect(revalidation.revalidate(artist.id)).toMatchObject({ unwanted: 0, removed: 0 });
    expect(track('trk00000002')?.status).toBe('wanted');

    // On disk it stays too, until the playlist no longer wants it either.
    const file = 'Test Artist/First Light/02 Low Tide.m4a';
    mkdirSync(join(root, 'music', dirname(file)), { recursive: true });
    writeFileSync(join(root, 'music', file), 'audio');
    db.update(tracks)
      .set({ status: 'on_disk', filePath: file })
      .where(eq(tracks.youtubeId, 'trk00000002'))
      .run();
    expect(revalidation.revalidate(artist.id)).toMatchObject({ removed: 0, kept: 1 });
    db.update(sources)
      .set({ matcher: and({ type: 'in_playlist_position_under', position: 2 }) })
      .where(eq(sources.id, playlist.id))
      .run();
    expect(revalidation.revalidate(artist.id)).toMatchObject({ removed: 1 });
    expect(existsSync(join(root, 'music', file))).toBe(false);
  });

  it('wants the tracks of a pinned album whatever the rules say, until it is unpinned', async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-music-pin-'));
    const { sync, addArtist, addPlaylist, track, db, jobs, history: historyService } = setup();
    const artist = addArtist(and({ type: 'title_contains', text: 'nothing matches this' }));
    await sync.checkSource(artist.id);
    expect(track('trk00000002')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
    const album = db.select().from(albums).where(eq(albums.youtubeId, 'OLAK5uy_album1')).get()!;
    db.update(albums).set({ pinned: true }).where(eq(albums.id, album.id)).run();

    // The sync: a playlist whose rules skip the track lists it; the pin makes it wanted.
    const playlist = addPlaylist(and({ type: 'title_contains', text: 'nothing either' }));
    await sync.checkSource(playlist.id);
    expect(track('trk00000002')).toMatchObject({ status: 'wanted', skipReason: null });

    // Revalidation: the album's other skipped tracks are wanted again, the file on disk stays.
    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const revalidation = new RevalidationService(db, config, historyService, jobs, sync);
    expect(revalidation.revalidate(artist.id)).toMatchObject({ rewanted: 2, unwanted: 0 });
    expect(track('trk00000003')?.status).toBe('wanted');
    const file = 'Test Artist/First Light/01 Heatwave.m4a';
    mkdirSync(join(root, 'music', dirname(file)), { recursive: true });
    writeFileSync(join(root, 'music', file), 'audio');
    db.update(tracks)
      .set({ status: 'on_disk', filePath: file })
      .where(eq(tracks.youtubeId, 'trk00000001'))
      .run();
    expect(revalidation.revalidate(artist.id)).toMatchObject({ removed: 0, kept: 1 });
    expect(revalidation.preview(artist.id, artist.matcher).wouldRemove).toEqual([]);

    // Unpinned, the rules decide again: the file goes and the wanted tracks are skipped.
    db.update(albums).set({ pinned: false }).where(eq(albums.id, album.id)).run();
    expect(revalidation.revalidate(artist.id)).toMatchObject({ removed: 1, unwanted: 2 });
    expect(existsSync(join(root, 'music', file))).toBe(false);
    expect(track('trk00000002')).toMatchObject({ status: 'skipped', skipReason: 'no_match' });
  });

  it('revalidation removes a track that no longer matches, with the video wording', async () => {
    root = mkdtempSync(join(tmpdir(), 'mytube-music-revalidate-'));
    const { sync, addArtist, track, db, jobs, history: historyService } = setup();
    const source = addArtist();
    await sync.checkSource(source.id);
    const file = 'Test Artist/First Light/03 Long Night (Live).m4a';
    const path = join(root, 'music', file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'audio');
    writeFileSync(path.replace(/\.m4a$/, '.jpg'), 'cover');
    db.update(tracks)
      .set({ status: 'on_disk', filePath: file, fileSizeBytes: 5 })
      .where(eq(tracks.youtubeId, 'trk00000003'))
      .run();
    db.update(sources)
      .set({ matcher: and(not({ type: 'title_matches', pattern: '\\blive\\b' })), sizeBytes: 5 })
      .where(eq(sources.id, source.id))
      .run();

    const config = new AppConfig({
      CONFIG_DIR: join(root, 'config'),
      VIDEO_DIR: join(root, 'video'),
      MUSIC_DIR: join(root, 'music'),
    });
    const revalidation = new RevalidationService(db, config, historyService, jobs, sync);
    const result = revalidation.revalidate(source.id);

    expect(result).toMatchObject({ removed: 1, kept: 0 });
    expect(existsSync(path)).toBe(false);
    expect(existsSync(join(root, 'music', 'Test Artist'))).toBe(false);
    expect(track('trk00000003')).toMatchObject({
      status: 'skipped',
      skipReason: 'no_longer_matches',
      filePath: null,
    });
    expect(db.select().from(history).all().at(-1)).toMatchObject({
      kind: 'music',
      title: 'Long Night (Live)',
      result: 'removed',
      details: 'no longer matches: not /\\blive\\b/',
    });
  });
});
