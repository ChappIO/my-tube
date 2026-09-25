import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  DEFAULT_MUSIC_MATCHER,
  ResolvedSource,
  RulesPreview,
  Source,
  SourceConflict,
  and,
  not,
} from '@mytube/shared';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';

/*
 * The sources API against the fake yt-dlp binary (test/fixtures/fake-yt-dlp): it prints
 * channel.json for channel URLs, playlist.json for `list=` URLs and video.json for
 * `watch?v=` URLs, all from NASA's channel.
 */

const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-yt-dlp', import.meta.url));
const NASA = 'UCLA_DiR1FfKNvjuUpBHmylQ';
const PLAYLIST = 'PLB29CbKaE2OY';
const CatalogRow = z.object({
  source_id: z.number().nullable(),
  name: z.string(),
  item_count: z.number().optional(),
});

const DEFAULT_TREE = and(not({ type: 'is_short' }), not({ type: 'older_than_days', days: 30 }));
const PLAYLIST_TREE = and(
  { type: 'channel_is', channel: 'NASA' },
  { type: 'in_playlist_position_under', position: 3 },
);

describe('Sources (e2e)', () => {
  let app: INestApplication;
  let configDir: string;
  let catalog: BetterSqlite3.Database;
  const server = () => app.getHttpServer();
  const resolve = (url: string) => request(server()).post('/api/sources/resolve').send({ url });

  beforeAll(async () => {
    configDir = mkdtempSync(join(tmpdir(), 'mytube-sources-e2e-'));
    process.env.CONFIG_DIR = configDir;
    process.env.YTDLP_PATH = FAKE_YTDLP;
    // Created sources are checked and downloaded at once; keep the files here.
    process.env.VIDEO_DIR = join(configDir, 'video');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
    catalog = new BetterSqlite3(join(configDir, 'mytube.db'), { readonly: true });
  });

  afterEach(() => {
    delete process.env.FAKE_YTDLP_FAIL;
  });

  afterAll(async () => {
    catalog.close();
    await app.close();
    delete process.env.VIDEO_DIR;
    rmSync(configDir, { recursive: true, force: true });
  });

  const catalogRow = (table: 'channels' | 'artists' | 'playlists', youtubeId: string) =>
    CatalogRow.optional().parse(
      catalog.prepare(`SELECT * FROM ${table} WHERE youtube_id = ?`).get(youtubeId),
    );

  describe('POST /api/sources/resolve', () => {
    it('resolves a channel', async () => {
      const response = await resolve('https://www.youtube.com/@NASA/videos?si=x').expect(200);
      expect(ResolvedSource.parse(response.body)).toEqual({
        kind: 'channel',
        library: 'video',
        youtubeId: NASA,
        url: `https://www.youtube.com/channel/${NASA}`,
        name: 'NASA',
        avatarUrl: expect.stringMatching(/^https:\/\/yt3\.googleusercontent\.com\//),
        itemCount: null,
        uploadsPerWeek: 1.3,
        latestItemAt: '2026-09-20T00:00:00.000Z',
        resolvedFrom: null,
        alreadyAdded: null,
      });
    });

    it('resolves a YouTube Music channel as an artist in Music', async () => {
      const response = await resolve(`https://music.youtube.com/channel/${NASA}`).expect(200);
      expect(ResolvedSource.parse(response.body)).toMatchObject({
        kind: 'artist',
        library: 'music',
        youtubeId: NASA,
        url: `https://music.youtube.com/channel/${NASA}`,
        name: 'NASA',
        resolvedFrom: null,
      });
    });

    it('resolves a playlist, also from a watch link inside it', async () => {
      for (const url of [
        `https://www.youtube.com/playlist?list=${PLAYLIST}`,
        `https://www.youtube.com/watch?v=90Kgw_SvK4w&list=${PLAYLIST}`,
      ]) {
        const response = await resolve(url).expect(200);
        expect(ResolvedSource.parse(response.body)).toEqual({
          kind: 'playlist',
          library: 'video',
          youtubeId: PLAYLIST,
          url: `https://www.youtube.com/playlist?list=${PLAYLIST}`,
          name: 'NASA Moon Base',
          avatarUrl: expect.stringMatching(/^https:\/\//),
          itemCount: 9,
          uploadsPerWeek: null,
          latestItemAt: null,
          resolvedFrom: null,
          alreadyAdded: null,
        });
      }
    });

    it('resolves a single video to its channel', async () => {
      const response = await resolve('https://youtu.be/90Kgw_SvK4w').expect(200);
      expect(ResolvedSource.parse(response.body)).toMatchObject({
        kind: 'channel',
        library: 'video',
        youtubeId: NASA,
        name: 'NASA',
        resolvedFrom: 'video',
      });
    });

    it('rejects unsupported links and bad bodies with 400', async () => {
      for (const url of ['https://vimeo.com/1234', 'https://www.youtube.com/feed/trending']) {
        const response = await resolve(url).expect(400);
        expect(response.body.message).toMatch(/^Not a YouTube channel, artist or playlist link/);
      }
      await request(server()).post('/api/sources/resolve').send({}).expect(400);
      await request(server()).post('/api/sources/resolve').send({ url: 42 }).expect(400);
    });

    it('returns 502 with the yt-dlp reason when yt-dlp fails', async () => {
      process.env.FAKE_YTDLP_FAIL = '1';
      const response = await resolve('https://www.youtube.com/@NASA').expect(502);
      expect(response.body).toMatchObject({
        statusCode: 502,
        message: 'yt-dlp could not read this link',
        reason: expect.stringContaining('Video unavailable'),
      });
    });
  });

  describe('source lifecycle', () => {
    let channelId: number;

    it('creates a video channel with the Settings → Video default rules', async () => {
      await request(server())
        .patch('/api/settings')
        .send({ video: { defaultRules: DEFAULT_TREE } })
        .expect(200);

      const response = await request(server())
        .post('/api/sources')
        .send({ url: 'https://www.youtube.com/@NASA', library: 'video' })
        .expect(201);
      const source = Source.parse(response.body);
      channelId = source.id;
      expect(source).toMatchObject({
        library: 'video',
        kind: 'channel',
        youtubeId: NASA,
        url: `https://www.youtube.com/channel/${NASA}`,
        name: 'NASA',
        subscribed: true,
        matcher: DEFAULT_TREE,
        options: { embedCoverArt: true, syncOrder: false },
        lastCheckedAt: null,
        itemCount: 0,
        sizeBytes: 0,
      });
      expect(catalogRow('channels', NASA)).toMatchObject({ source_id: channelId, name: 'NASA' });
    });

    it('resolve reports the source as already added', async () => {
      const response = await request(server())
        .post('/api/sources/resolve')
        .send({ url: 'https://www.youtube.com/@NASA' })
        .expect(200);
      expect(ResolvedSource.parse(response.body).alreadyAdded).toEqual({
        sourceId: channelId,
        library: 'video',
      });
    });

    it('409s on a duplicate with the existing source id', async () => {
      const response = await request(server())
        .post('/api/sources')
        .send({ url: `https://www.youtube.com/channel/${NASA}`, library: 'video' })
        .expect(409);
      expect(SourceConflict.parse(response.body).sourceId).toBe(channelId);
    });

    it('400s on invalid combinations', async () => {
      const bodies = [
        // An artist in the Video library.
        { url: 'https://www.youtube.com/@NASA', library: 'video', kind: 'artist' },
        // The old flat rules are gone.
        { url: 'https://www.youtube.com/@NASA', library: 'video', rules: { library: 'video' } },
        // Sync order and playlist-only conditions on a channel.
        { url: 'https://www.youtube.com/@NASA', library: 'video', options: { syncOrder: true } },
        {
          url: 'https://www.youtube.com/@NASA',
          library: 'video',
          matcher: and({ type: 'channel_is', channel: 'NASA' }),
        },
        // An invalid regular expression.
        {
          url: 'https://www.youtube.com/@NASA',
          library: 'video',
          matcher: { type: 'title_matches', pattern: '([' },
        },
        // A playlist link as a channel.
        {
          url: `https://www.youtube.com/playlist?list=${PLAYLIST}`,
          library: 'video',
          kind: 'channel',
        },
        // Unknown option, missing library, unsupported link.
        { url: 'https://www.youtube.com/@NASA', library: 'video', options: { x: 1 } },
        { url: 'https://www.youtube.com/@NASA' },
        { url: 'https://vimeo.com/1', library: 'video' },
      ];
      const statuses = [];
      for (const body of bodies) {
        statuses.push((await request(server()).post('/api/sources').send(body)).status);
      }
      expect(statuses).toEqual(bodies.map(() => 400));
      const artist = await request(server()).post('/api/sources').send(bodies[0]).expect(400);
      expect(artist.body.issues).toEqual([
        { path: ['kind'], message: 'Artists belong to the Music library' },
      ]);
    });

    it('creates the same channel as an artist in Music and a playlist', async () => {
      const artist = Source.parse(
        (
          await request(server())
            .post('/api/sources')
            .send({ url: 'https://www.youtube.com/@NASA', library: 'music' })
            .expect(201)
        ).body,
      );
      expect(artist).toMatchObject({
        library: 'music',
        kind: 'artist',
        url: `https://music.youtube.com/channel/${NASA}`,
        matcher: DEFAULT_MUSIC_MATCHER,
        options: { embedCoverArt: true, syncOrder: false },
      });
      expect(catalogRow('artists', NASA)).toMatchObject({ source_id: artist.id });

      const playlist = Source.parse(
        (
          await request(server())
            .post('/api/sources')
            .send({
              url: `https://www.youtube.com/playlist?list=${PLAYLIST}`,
              library: 'video',
              matcher: PLAYLIST_TREE,
              options: { syncOrder: true },
            })
            .expect(201)
        ).body,
      );
      expect(playlist).toMatchObject({
        kind: 'playlist',
        matcher: PLAYLIST_TREE,
        options: { embedCoverArt: true, syncOrder: true },
      });
      expect(catalogRow('playlists', PLAYLIST)).toMatchObject({
        source_id: playlist.id,
        item_count: 9,
      });
    });

    it('lists sources newest first, filtered by library', async () => {
      const all = Source.array().parse(
        (await request(server()).get('/api/sources').expect(200)).body,
      );
      expect(all.map((s) => [s.library, s.kind])).toEqual([
        ['video', 'playlist'],
        ['music', 'artist'],
        ['video', 'channel'],
      ]);
      const video = Source.array().parse(
        (await request(server()).get('/api/sources?library=video').expect(200)).body,
      );
      expect(video.map((s) => s.kind)).toEqual(['playlist', 'channel']);
      await request(server()).get('/api/sources?library=podcasts').expect(400);
    });

    it('gets one source, 404 JSON when missing', async () => {
      const response = await request(server()).get(`/api/sources/${channelId}`).expect(200);
      expect(Source.parse(response.body).id).toBe(channelId);
      const missing = await request(server()).get('/api/sources/9999').expect(404);
      expect(missing.body).toMatchObject({ statusCode: 404, message: 'Source 9999 not found' });
      await request(server()).get('/api/sources/abc').expect(400);
    });

    it('replaces the rules, overlays options and bumps updatedAt', async () => {
      const before = Source.parse((await request(server()).get(`/api/sources/${channelId}`)).body);
      const tree = and(not({ type: 'older_than_days', days: 7 }));
      const response = await request(server())
        .patch(`/api/sources/${channelId}`)
        .send({ matcher: tree, options: { embedCoverArt: false }, name: 'NASA (main)' })
        .expect(200);
      const after = Source.parse(response.body);
      expect(after.matcher).toEqual(tree);
      expect(after.options).toEqual({ embedCoverArt: false, syncOrder: false });
      expect(after.name).toBe('NASA (main)');
      expect(after.updatedAt > before.updatedAt).toBe(true);

      const badBodies = [
        {},
        { rules: { library: 'video', keepDays: 7 } },
        { options: { syncOrder: true } },
        { matcher: { type: 'older_than_days', days: 0 } },
        { matcher: and({ type: 'in_playlist_position_under', position: 5 }) },
        { library: 'music' },
      ];
      const statuses = [];
      for (const body of badBodies) {
        statuses.push(
          (await request(server()).patch(`/api/sources/${channelId}`).send(body)).status,
        );
      }
      expect(statuses).toEqual(badBodies.map(() => 400));
      await request(server()).patch('/api/sources/9999').send({ subscribed: false }).expect(404);
    });

    it('toggles the bell off and on without touching anything else', async () => {
      const before = Source.parse((await request(server()).get(`/api/sources/${channelId}`)).body);
      const off = Source.parse(
        (
          await request(server())
            .patch(`/api/sources/${channelId}/subscribed`)
            .send({ subscribed: false })
            .expect(200)
        ).body,
      );
      expect(off.subscribed).toBe(false);
      expect(off.matcher).toEqual(before.matcher);
      expect(off.options).toEqual(before.options);
      expect(catalogRow('channels', NASA)).toMatchObject({ source_id: channelId });
      const got = Source.parse((await request(server()).get(`/api/sources/${channelId}`)).body);
      expect(got.subscribed).toBe(false);

      const on = await request(server())
        .patch(`/api/sources/${channelId}/subscribed`)
        .send({ subscribed: true })
        .expect(200);
      expect(Source.parse(on.body).subscribed).toBe(true);
      await request(server()).patch(`/api/sources/${channelId}/subscribed`).send({}).expect(400);
    });

    it('previews what new rules would remove, changing nothing', async () => {
      const preview = RulesPreview.parse(
        (
          await request(server())
            .post(`/api/sources/${channelId}/rules/preview`)
            .send({ matcher: and({ type: 'is_short' }) })
            .expect(200)
        ).body,
      );
      // Nothing of this source is on disk in this suite (the activity e2e covers removals).
      expect(preview).toEqual({ wouldRemove: [], wouldKeep: 0 });
      await request(server())
        .post('/api/sources/9999/rules/preview')
        .send({ matcher: and() })
        .expect(404);
      await request(server())
        .post(`/api/sources/${channelId}/rules/preview`)
        .send({ matcher: { type: 'nope' } })
        .expect(400);
      const playlistOnly = await request(server())
        .post(`/api/sources/${channelId}/rules/preview`)
        .send({ matcher: and({ type: 'channel_is', channel: 'NASA' }) })
        .expect(400);
      expect(playlistOnly.body.issues).toEqual([
        { path: ['matcher'], message: 'The channel condition only applies to playlists' },
      ]);
    });

    it('deletes the source row only; the catalog row stays, unlinked', async () => {
      await request(server()).delete(`/api/sources/${channelId}`).expect(204);
      await request(server()).get(`/api/sources/${channelId}`).expect(404);
      expect(catalogRow('channels', NASA)).toMatchObject({ source_id: null, name: 'NASA' });
      // The Music artist and the playlist are untouched.
      expect(catalogRow('artists', NASA)?.source_id).not.toBeNull();
      const left = Source.array().parse((await request(server()).get('/api/sources')).body);
      expect(left.map((s) => s.kind)).toEqual(['playlist', 'artist']);
      await request(server()).delete(`/api/sources/${channelId}`).expect(404);
    });
  });
});
