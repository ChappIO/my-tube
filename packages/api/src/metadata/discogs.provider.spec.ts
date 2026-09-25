import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type MusicSettings } from '@mytube/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../config/app-config.js';
import {
  DiscogsProvider,
  DiscogsRelease,
  DiscogsSearch,
  discogsName,
  discogsReleaseUrl,
  discogsSearchUrl,
  findDiscogsTrack,
  pickDiscogsResult,
} from './discogs.provider.js';
import { ProviderHttpError, RateLimiter } from './lookup-support.js';
import type { LookupContext, TrackLookup } from './provider.js';

// A real search for "Red Room" by Hiatus Kaiyote and the first release it names, trimmed.
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../test/fixtures/metadata', name), 'utf8'));
const SEARCH = fixture('discogs-search-red-room.json');
const RELEASE = fixture('discogs-release-mood-valiant.json');
const TOKEN = 'SeCrEtToKeN123';

function lookup(tags: Partial<TrackLookup['tags']> = {}): TrackLookup {
  return {
    youtubeId: 'abc',
    durationSeconds: 232,
    uploadTitle: null,
    featuredArtists: [],
    tags: {
      title: 'Red Room',
      artist: 'Hiatus Kaiyote',
      album: 'Mood Valiant',
      albumArtist: null,
      trackNumber: null,
      discNumber: null,
      year: null,
      ...tags,
    },
  };
}

function music(enabled: boolean, token: string | null): MusicSettings {
  return {
    ...DEFAULT_SETTINGS.music,
    metadataProviders: { musicbrainz: { enabled: false }, discogs: { enabled, token } },
  };
}

/** A limiter that never waits. */
const noWait = () =>
  new RateLimiter(
    1000,
    () => 0,
    () => Promise.resolve(),
  );

const context = (settings = music(true, TOKEN)): LookupContext => ({
  settings,
  log: () => undefined,
});

describe('Discogs request building', () => {
  it('searches releases by artist and track, the token never in the URL', () => {
    const url = new URL(discogsSearchUrl('Hiatus Kaiyote', 'Red Room'));
    expect(url.origin + url.pathname).toBe('https://api.discogs.com/database/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: 'release',
      artist: 'Hiatus Kaiyote',
      track: 'Red Room',
      per_page: '10',
    });
    expect(discogsReleaseUrl(19323967)).toBe('https://api.discogs.com/releases/19323967');
  });

  it('drops namesake numbers and variation stars from names', () => {
    expect(discogsName('Nirvana (2)')).toBe('Nirvana');
    expect(discogsName('Prince*')).toBe('Prince');
  });
});

describe('Discogs response parsing', () => {
  const search = DiscogsSearch.parse(SEARCH);
  const release = DiscogsRelease.parse(RELEASE);

  it('picks a CD or digital release by the artist with the album title', () => {
    expect(pickDiscogsResult(search, lookup())).toEqual({
      result: expect.objectContaining({ id: 19323967 }),
      confidence: 0.9,
    });
    // Without an album: the first by the artist, less confident.
    expect(pickDiscogsResult(search, lookup({ album: null }))?.confidence).toBe(0.8);
    expect(pickDiscogsResult(search, lookup({ album: 'Tawk Tomahawk' }))).toBeNull();
    expect(pickDiscogsResult(search, lookup({ artist: 'Someone Else' }))).toBeNull();
  });

  it('finds the track position in the tracklist', () => {
    expect(findDiscogsTrack(release, 'Red Room')).toEqual({ trackNumber: 9, discNumber: 1 });
    expect(findDiscogsTrack(release, 'red room')).toEqual({ trackNumber: 9, discNumber: 1 });
    expect(findDiscogsTrack(release, 'Nope')).toBeNull();
  });

  it('reads disc-track and vinyl side positions, skipping headings', () => {
    const vinyl = DiscogsRelease.parse({
      id: 1,
      title: 'X',
      tracklist: [
        { position: '', type_: 'heading', title: 'Side A' },
        { position: 'A1', type_: 'track', title: 'One' },
        { position: 'A2', type_: 'track', title: 'Two' },
        { position: 'B1', type_: 'track', title: 'Three' },
        { position: '2-4', type_: 'track', title: 'Four' },
      ],
    });
    expect(findDiscogsTrack(vinyl, 'Three')).toEqual({ trackNumber: 3, discNumber: null });
    expect(findDiscogsTrack(vinyl, 'Four')).toEqual({ trackNumber: 4, discNumber: 2 });
    expect(findDiscogsTrack(vinyl, 'Side A')).toBeNull();
  });
});

describe('DiscogsProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  const config = new AppConfig({ APP_VERSION: '9.9.9' });

  it('is off by default and does nothing without a token', () => {
    const provider = new DiscogsProvider(config, noWait());
    expect(provider.enabled(DEFAULT_SETTINGS.music)).toBe(false);
    expect(provider.enabled(music(true, null))).toBe(false);
    expect(provider.enabled(music(false, TOKEN))).toBe(false);
    expect(provider.enabled(music(true, TOKEN))).toBe(true);
  });

  it('searches, reads the release and answers the album, position and year', async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) =>
      Promise.resolve(Response.json(url.includes('/releases/') ? RELEASE : SEARCH)),
    );
    vi.stubGlobal('fetch', fetch);
    const { match } = await new DiscogsProvider(config, noWait()).lookup(lookup(), context());
    expect(match).toEqual({
      tags: {
        album: 'Mood Valiant',
        albumArtist: 'Hiatus Kaiyote',
        trackNumber: 9,
        discNumber: 1,
        year: 2021,
      },
      confidence: 0.9,
      summary: 'release 19323967',
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      discogsSearchUrl('Hiatus Kaiyote', 'Red Room'),
      discogsReleaseUrl(19323967),
    ]);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).not.toContain(TOKEN);
      expect(init?.headers).toMatchObject({
        Authorization: `Discogs token=${TOKEN}`,
        'User-Agent': 'MyTube/9.9.9 +https://github.com/ChappIO/my-tube',
      });
    }
  });

  it('asks nothing without a token and answers null when no release fits', async () => {
    const fetch = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(Response.json({ results: [] })),
    );
    vi.stubGlobal('fetch', fetch);
    const provider = new DiscogsProvider(config, noWait());
    expect((await provider.lookup(lookup(), context(music(true, null)))).match).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect((await provider.lookup(lookup(), context())).match).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the upload title and accepts collaboration credits', async () => {
    const collab = {
      results: [
        { id: 5, title: 'MDK (2) & t+pazolite - Password', year: '2020', format: ['File'] },
      ],
    };
    const release = {
      id: 5,
      title: 'Password',
      year: 2020,
      artists: [
        { name: 'MDK (2)', join: '&' },
        { name: 't+pazolite', join: '' },
      ],
      tracklist: [{ position: '1', type_: 'track', title: 'MDK x t+pazolite - Password' }],
    };
    vi.stubGlobal('fetch', (url: string) => {
      if (url.includes('/releases/')) return Promise.resolve(Response.json(release));
      return Promise.resolve(Response.json(url.includes('pazolite') ? collab : { results: [] }));
    });
    const track = {
      ...lookup({ title: 'Password', artist: 'MDK', album: null }),
      uploadTitle: 'MDK x t+pazolite - Password',
    };
    const result = await new DiscogsProvider(config, noWait()).lookup(track, context());
    expect(result.tried).toEqual(['Password', 'MDK x t+pazolite - Password']);
    expect(result.match?.tags).toMatchObject({
      album: 'Password',
      albumArtist: 'MDK & t+pazolite',
      trackNumber: 1,
    });
  });

  it('is not confident when the release lacks the track', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(Response.json(url.includes('/releases/') ? RELEASE : SEARCH)),
    );
    const { match } = await new DiscogsProvider(config, noWait()).lookup(
      lookup({ title: 'Not On It' }),
      context(),
    );
    expect(match?.confidence).toBe(0);
  });

  it('rejects on HTTP errors and network failures, without the token in the message', async () => {
    const provider = new DiscogsProvider(config, noWait());
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 429 })));
    const error = await provider.lookup(lookup(), context()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(String(error)).not.toContain(TOKEN);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(provider.lookup(lookup(), context())).rejects.toThrow('fetch failed');
  });

  it('waits its turn: one request per second over both calls', async () => {
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(Response.json(url.includes('/releases/') ? RELEASE : SEARCH)),
    );
    const waits: number[] = [];
    const clock = { now: 0 };
    const limiter = new RateLimiter(
      1000,
      () => clock.now,
      (ms) => {
        waits.push(ms);
        clock.now += ms;
        return Promise.resolve();
      },
    );
    await new DiscogsProvider(config, limiter).lookup(lookup(), context());
    expect(waits).toEqual([1000]);
  });
});
