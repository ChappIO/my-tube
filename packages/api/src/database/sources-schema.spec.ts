import {
  DEFAULT_SOURCE_OPTIONS,
  DEFAULT_VIDEO_MATCHER,
  Source,
  and,
  describeSource,
  not,
} from '@mytube/shared';
import type BetterSqlite3 from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, openDatabase, type Database } from './database.module.js';
import { runMigrations } from './migrate.js';
import { artists, channels, playlists, sources } from './schema.js';

/** Proves the sources migration and the Drizzle schema describe the same tables. */
describe('sources schema', () => {
  let client: BetterSqlite3.Database;
  let db: Database;

  const channelSource = {
    library: 'video' as const,
    kind: 'channel' as const,
    youtubeId: 'UCmonologue',
    url: 'https://www.youtube.com/@monologue',
    name: 'Monologue',
    matcher: and(not({ type: 'is_short' }), { type: 'title_contains' as const, text: 'Monologue' }),
    options: DEFAULT_SOURCE_OPTIONS,
  };

  beforeEach(() => {
    const opened = openDatabase(':memory:');
    client = opened.client;
    db = opened.db;
    runMigrations(client, MIGRATIONS_DIR);
  });

  afterEach(() => {
    client.close();
  });

  it('inserts and reads a source with typed rules and defaults', () => {
    const inserted = db.insert(sources).values(channelSource).returning().get();
    const row = db.select().from(sources).where(eq(sources.id, inserted.id)).get();

    expect(row).toMatchObject({
      ...channelSource,
      avatarUrl: null,
      subscribed: true,
      lastCheckedAt: null,
      itemCount: 0,
      sizeBytes: 0,
    });
    expect(row?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(row?.updatedAt).toBe(row?.createdAt);
    // The row maps one to one onto the shared DTO.
    const dto = Source.parse(row);
    expect(describeSource(dto)).toEqual(['no shorts', 'only "Monologue"']);

    const raw = client
      .prepare<[], { subscribed: number; matcher: string; options: string }>(
        'SELECT subscribed, matcher, options FROM sources',
      )
      .get();
    expect(raw?.subscribed).toBe(1);
    expect(JSON.parse(raw?.matcher ?? '')).toEqual(channelSource.matcher);
    expect(JSON.parse(raw?.options ?? '')).toEqual(DEFAULT_SOURCE_OPTIONS);
  });

  it('keeps youtube ids unique per library', () => {
    db.insert(sources).values(channelSource).run();
    expect(() => db.insert(sources).values(channelSource).run()).toThrow(/UNIQUE/);
    // The same channel may also be a source in the other library.
    db.insert(sources)
      .values({ ...channelSource, library: 'music', matcher: DEFAULT_VIDEO_MATCHER })
      .run();
    expect(db.select().from(sources).all()).toHaveLength(2);
  });

  it('rejects bad enums and invalid JSON rules', () => {
    expect(() =>
      client
        .prepare(
          `INSERT INTO sources (library, kind, youtube_id, url, name, matcher)
           VALUES ('podcast', 'channel', 'x', 'https://x', 'x', '{"type":"and","items":[]}')`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      client
        .prepare(
          `INSERT INTO sources (library, kind, youtube_id, url, name, matcher)
           VALUES ('video', 'channel', 'x', 'https://x', 'x', 'not json')`,
        )
        .run(),
    ).toThrow(/CHECK|malformed JSON/);
    expect(() =>
      client
        .prepare(
          `INSERT INTO sources (library, kind, youtube_id, url, name, options)
           VALUES ('video', 'channel', 'x', 'https://x', 'x', '{')`,
        )
        .run(),
    ).toThrow(/CHECK|malformed JSON/);
  });

  it('links catalog rows to sources and unlinks them when a source goes away', () => {
    const source = db.insert(sources).values(channelSource).returning().get();
    const channel = db
      .insert(channels)
      .values({ sourceId: source.id, youtubeId: 'UCmonologue', name: 'Monologue' })
      .returning()
      .get();
    // A channel known only through a playlist has no source.
    db.insert(channels).values({ youtubeId: 'UCother', name: 'Other' }).run();
    const artist = db
      .insert(artists)
      .values({ sourceId: source.id, name: 'Monologue' })
      .returning()
      .get();
    const playlist = db
      .insert(playlists)
      .values({ sourceId: source.id, library: 'video', youtubeId: 'PL1', name: 'Best of' })
      .returning()
      .get();
    expect(playlist.itemCount).toBe(0);

    expect(() =>
      db.insert(channels).values({ youtubeId: 'UCmonologue', name: 'Duplicate' }).run(),
    ).toThrow(/UNIQUE/);
    expect(() =>
      db.insert(playlists).values({ library: 'video', youtubeId: 'PL1', name: 'Duplicate' }).run(),
    ).toThrow(/UNIQUE/);
    expect(() =>
      db.insert(channels).values({ sourceId: 999, youtubeId: 'UCghost', name: 'Ghost' }).run(),
    ).toThrow(/FOREIGN KEY/);
    // Artists without a YouTube id are allowed, more than one of them.
    db.insert(artists).values({ name: 'Tag only A' }).run();
    db.insert(artists).values({ name: 'Tag only B' }).run();

    db.delete(sources).where(eq(sources.id, source.id)).run();
    expect(db.select().from(channels).where(eq(channels.id, channel.id)).get()?.sourceId).toBe(
      null,
    );
    expect(db.select().from(artists).where(eq(artists.id, artist.id)).get()?.sourceId).toBe(null);
    expect(db.select().from(playlists).where(eq(playlists.id, playlist.id)).get()?.sourceId).toBe(
      null,
    );
  });
});
