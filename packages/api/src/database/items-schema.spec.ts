import { DEFAULT_VIDEO_RULES, Track, Video } from '@mytube/shared';
import type BetterSqlite3 from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, type Database } from './database.module.js';
import { runMigrations } from './migrate.js';
import {
  albums,
  artists,
  channels,
  playlistItems,
  playlists,
  sources,
  tracks,
  videos,
} from './schema.js';

/** Proves the items migration and the Drizzle schema describe the same tables. */
describe('items schema', () => {
  let client: BetterSqlite3.Database;
  let db: Database;
  let channelId: number;
  let artistId: number;
  let sourceId: number;

  beforeEach(() => {
    const opened = openDatabase(':memory:');
    client = opened.client;
    db = opened.db;
    runMigrations(client, MIGRATIONS_DIR);
    sourceId = db
      .insert(sources)
      .values({
        library: 'video',
        kind: 'channel',
        youtubeId: 'UCwood',
        url: 'https://www.youtube.com/channel/UCwood',
        name: 'Woodshop',
        rules: DEFAULT_VIDEO_RULES,
      })
      .returning()
      .get().id;
    channelId = db
      .insert(channels)
      .values({ youtubeId: 'UCwood', name: 'Woodshop', sourceId })
      .returning()
      .get().id;
    artistId = db
      .insert(artists)
      .values({ youtubeId: 'UCband', name: 'Band' })
      .returning()
      .get().id;
  });

  afterEach(() => {
    client.close();
  });

  it('stores a video with defaults that parses as the shared DTO', () => {
    const row = db
      .insert(videos)
      .values({ channelId, sourceId, youtubeId: 'abc', title: 'Dovetails', isShort: true })
      .returning()
      .get();
    expect(row).toMatchObject({
      status: 'wanted',
      skipReason: null,
      isShort: true,
      filePath: null,
      downloadedAt: null,
    });
    expect(Video.parse(row).status).toBe('wanted');

    db.update(videos)
      .set({ status: 'skipped', skipReason: 'short' })
      .where(eq(videos.id, row.id))
      .run();
    expect(Video.parse(db.select().from(videos).get()).skipReason).toBe('short');
  });

  it('rejects unknown statuses and duplicate youtube ids', () => {
    expect(() =>
      client
        .prepare(
          "INSERT INTO videos (channel_id, youtube_id, title, status) VALUES (?, 'x', 't', 'gone')",
        )
        .run(channelId),
    ).toThrow(/CHECK/);
    db.insert(videos).values({ channelId, youtubeId: 'dup', title: 't' }).run();
    expect(() =>
      db.insert(videos).values({ channelId, youtubeId: 'dup', title: 't' }).run(),
    ).toThrow(/UNIQUE/);
  });

  it('keeps items when their source is removed', () => {
    db.insert(videos).values({ channelId, sourceId, youtubeId: 'abc', title: 't' }).run();
    db.insert(tracks).values({ artistId, sourceId, youtubeId: 'trk', title: 't' }).run();
    db.delete(sources).where(eq(sources.id, sourceId)).run();
    expect(db.select().from(videos).get()?.sourceId).toBeNull();
    expect(db.select().from(tracks).get()?.sourceId).toBeNull();
  });

  it('stores albums and tracks that parse as the shared DTO', () => {
    const album = db
      .insert(albums)
      .values({ artistId, youtubeId: 'OLAK', title: 'First', year: 2024, trackCount: 10 })
      .returning()
      .get();
    const track = db
      .insert(tracks)
      .values({ albumId: album.id, artistId, youtubeId: 'trk', title: 'Song', trackNumber: 3 })
      .returning()
      .get();
    expect(Track.parse(track)).toMatchObject({
      albumId: album.id,
      trackNumber: 3,
      discNumber: null,
    });
  });

  it('holds exactly one of video and track per playlist position', () => {
    const playlistId = db
      .insert(playlists)
      .values({ library: 'video', youtubeId: 'PL1', name: 'List' })
      .returning()
      .get().id;
    const videoId = db
      .insert(videos)
      .values({ channelId, youtubeId: 'v1', title: 't' })
      .returning()
      .get().id;
    const trackId = db
      .insert(tracks)
      .values({ artistId, youtubeId: 't1', title: 't' })
      .returning()
      .get().id;

    db.insert(playlistItems).values({ playlistId, position: 1, videoId }).run();
    expect(() => db.insert(playlistItems).values({ playlistId, position: 2 }).run()).toThrow(
      /CHECK/,
    );
    expect(() =>
      db.insert(playlistItems).values({ playlistId, position: 2, videoId, trackId }).run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db.insert(playlistItems).values({ playlistId, position: 1, trackId }).run(),
    ).toThrow(/UNIQUE/);

    db.delete(playlists).where(eq(playlists.id, playlistId)).run();
    expect(db.select().from(playlistItems).all()).toEqual([]);
    expect(db.select().from(videos).all()).toHaveLength(1);
  });
});
