import { DEFAULT_MUSIC_RULES, DEFAULT_VIDEO_RULES, Source, describeRules } from '@mytube/shared';
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
    rules: { ...DEFAULT_VIDEO_RULES, titleFilter: 'Monologue' },
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
    expect(describeRules(dto.rules)).toEqual(['no shorts', 'keep 90 days', 'only "Monologue"']);

    const raw = client
      .prepare<[], { subscribed: number; rules: string }>('SELECT subscribed, rules FROM sources')
      .get();
    expect(raw?.subscribed).toBe(1);
    expect(JSON.parse(raw?.rules ?? '')).toEqual(channelSource.rules);
  });

  it('keeps youtube ids unique per library', () => {
    db.insert(sources).values(channelSource).run();
    expect(() => db.insert(sources).values(channelSource).run()).toThrow(/UNIQUE/);
    // The same channel may also be a source in the other library.
    db.insert(sources)
      .values({ ...channelSource, library: 'music', rules: DEFAULT_MUSIC_RULES })
      .run();
    expect(db.select().from(sources).all()).toHaveLength(2);
  });

  it('rejects bad enums and rules of the other library', () => {
    expect(() =>
      client
        .prepare(
          `INSERT INTO sources (library, kind, youtube_id, url, name, rules)
           VALUES ('podcast', 'channel', 'x', 'https://x', 'x', '{"library":"podcast"}')`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .insert(sources)
        .values({ ...channelSource, rules: DEFAULT_MUSIC_RULES })
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      client
        .prepare(
          `INSERT INTO sources (library, kind, youtube_id, url, name, rules)
           VALUES ('video', 'channel', 'x', 'https://x', 'x', 'not json')`,
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
