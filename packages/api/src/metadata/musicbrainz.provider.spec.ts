import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '@mytube/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../config/app-config.js';
import { ProviderHttpError, RateLimiter } from './lookup-support.js';
import {
  MusicBrainzProvider,
  RecordingSearch,
  musicbrainzUserAgent,
  pickRecordingMatch,
  recordingSearchUrl,
} from './musicbrainz.provider.js';
import type { LookupContext, TrackLookup } from './provider.js';

// A real recording search for "Red Room" by Hiatus Kaiyote, trimmed.
const FIXTURE: unknown = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../test/fixtures/metadata/musicbrainz-red-room.json'),
    'utf8',
  ),
);
const SEARCH = RecordingSearch.parse(FIXTURE);

function lookup(
  tags: Partial<TrackLookup['tags']> = {},
  durationSeconds: number | null = 232,
  extra: Partial<Pick<TrackLookup, 'uploadTitle' | 'featuredArtists'>> = {},
) {
  return {
    youtubeId: 'abc',
    durationSeconds,
    uploadTitle: null as string | null,
    featuredArtists: [] as string[],
    ...extra,
    tags: {
      title: 'Red Room',
      artist: 'Hiatus Kaiyote',
      album: 'Mood Valiant',
      albumArtist: 'Hiatus Kaiyote',
      trackNumber: 9,
      discNumber: null,
      year: 2021,
      ...tags,
    },
  } satisfies TrackLookup;
}

const context = (log: string[] = []): LookupContext => ({
  settings: DEFAULT_SETTINGS.music,
  log: (line) => log.push(line),
});

/** A limiter on a fake clock that never really waits; `waits` records each delay. */
function limiter() {
  const waits: number[] = [];
  const clock = { now: 0 };
  const instance = new RateLimiter(
    1000,
    () => clock.now,
    (ms) => {
      waits.push(ms);
      clock.now += ms;
      return Promise.resolve();
    },
  );
  return { instance, waits };
}

describe('recordingSearchUrl', () => {
  it('searches the title and artist as escaped phrases', () => {
    const url = new URL(recordingSearchUrl('Say "Hi" \\ Bye', 'AC/DC'));
    expect(url.origin + url.pathname).toBe('https://musicbrainz.org/ws/2/recording');
    expect(url.searchParams.get('query')).toBe(
      'recording:"Say \\"Hi\\" \\\\ Bye" AND artist:"AC/DC"',
    );
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('names the application, its version and a contact', () => {
    expect(musicbrainzUserAgent('1.2.3')).toBe(
      'MyTube/1.2.3 ( https://github.com/ChappIO/my-tube )',
    );
  });
});

describe('pickRecordingMatch', () => {
  it('takes the release named like the album: its position, disc and original year', () => {
    expect(pickRecordingMatch(SEARCH, lookup())).toEqual({
      tags: {
        album: 'Mood Valiant',
        albumArtist: 'Hiatus Kaiyote',
        trackNumber: 9,
        discNumber: 1,
        year: 2021,
      },
      confidence: 0.95,
      summary: expect.stringContaining('recording 3a992a96'),
    });
  });

  it('prefers an official plain album when the album is unknown', () => {
    const match = pickRecordingMatch(SEARCH, lookup({ album: null }));
    expect(match?.confidence).toBe(0.85);
    expect(match?.tags).toMatchObject({ album: 'Mood Valiant', trackNumber: 9, year: 2021 });
  });

  it('is not confident when no release carries the album', () => {
    const match = pickRecordingMatch(SEARCH, lookup({ album: 'Tawk Tomahawk' }));
    expect(match).toEqual({
      tags: {},
      confidence: 0,
      summary: expect.stringContaining('no release named "Tawk Tomahawk"'),
    });
  });

  it('ignores other titles (remixes), other artists and other lengths', () => {
    expect(pickRecordingMatch(SEARCH, lookup({ title: 'Red Room (Nick Hakim remix)' }))).toBeNull();
    expect(pickRecordingMatch(SEARCH, lookup({ artist: 'Hiatus' }))).toBeNull();
    expect(pickRecordingMatch(SEARCH, lookup({}, 300))).toBeNull();
    // Case, accents and punctuation do not matter; an unknown length does not either.
    expect(pickRecordingMatch(SEARCH, lookup({ title: 'red  room!' }, null))?.confidence).toBe(
      0.95,
    );
  });
});

describe('MusicBrainzProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  const config = new AppConfig({ APP_VERSION: '9.9.9' });

  it('is off by default and on with its toggle', () => {
    const provider = new MusicBrainzProvider(config);
    expect(provider.enabled(DEFAULT_SETTINGS.music)).toBe(false);
    expect(
      provider.enabled({
        ...DEFAULT_SETTINGS.music,
        metadataProviders: {
          ...DEFAULT_SETTINGS.music.metadataProviders,
          musicbrainz: { enabled: true },
        },
      }),
    ).toBe(true);
  });

  it('sends one request with their User-Agent and reads the answer', async () => {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(Response.json(FIXTURE)),
    );
    vi.stubGlobal('fetch', fetch);
    const { instance } = limiter();
    const result = await new MusicBrainzProvider(config, instance).lookup(lookup(), context());
    expect(result.match?.tags.trackNumber).toBe(9);
    expect(result.tried).toEqual(['Red Room']);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(recordingSearchUrl('Red Room', 'Hiatus Kaiyote'));
    expect(init?.headers).toMatchObject({
      'User-Agent': 'MyTube/9.9.9 ( https://github.com/ChappIO/my-tube )',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('searches the cleaned title first, then the upload title, with the featured artists', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(Response.json({ recordings: [] }));
    });
    const { instance, waits } = limiter();
    const track = lookup({ title: 'Password', artist: 'MDK' }, null, {
      uploadTitle: 'MDK x t+pazolite - Password',
      featuredArtists: ['t+pazolite'],
    });
    const result = await new MusicBrainzProvider(config, instance).lookup(track, context());
    expect(result).toEqual({
      match: null,
      tried: ['Password', 'MDK x t+pazolite - Password'],
      alsoSearched: ['t+pazolite'],
    });
    expect(urls).toEqual([
      recordingSearchUrl('Password', 'MDK', ['t+pazolite']),
      recordingSearchUrl('MDK x t+pazolite - Password', 'MDK', ['t+pazolite']),
    ]);
    expect(new URL(urls[0]!).searchParams.get('query')).toBe(
      'recording:"Password" AND artist:"MDK" artist:"t+pazolite"',
    );
    // Two requests, one second apart.
    expect(waits).toEqual([1000]);
  });

  it('stops at the first title that matches', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(() =>
      Promise.resolve(Response.json(FIXTURE)),
    );
    vi.stubGlobal('fetch', fetch);
    const { instance } = limiter();
    const result = await new MusicBrainzProvider(config, instance).lookup(
      lookup({}, 232, { uploadTitle: 'Hiatus Kaiyote - Red Room' }),
      context(),
    );
    expect(result.tried).toEqual(['Red Room']);
    expect(result.match?.confidence).toBe(0.95);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('matches the upload title when the fallback finds the recording', () => {
    const track = lookup({ title: 'Redroom' }, 232, { uploadTitle: 'Red Room' });
    expect(pickRecordingMatch(SEARCH, track)).toBeNull();
    expect(pickRecordingMatch(SEARCH, track, 'Red Room')?.confidence).toBe(0.95);
  });

  it('keeps to one request per second across lookups', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json(FIXTURE)));
    const { instance, waits } = limiter();
    const provider = new MusicBrainzProvider(config, instance);
    await Promise.all([
      provider.lookup(lookup(), context()),
      provider.lookup(lookup(), context()),
      provider.lookup(lookup(), context()),
    ]);
    expect(waits).toEqual([1000, 1000]);
  });

  it('rejects on HTTP errors, network failures and unexpected documents', async () => {
    const { instance } = limiter();
    const provider = new MusicBrainzProvider(config, instance);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('busy', { status: 503 })));
    await expect(provider.lookup(lookup(), context())).rejects.toBeInstanceOf(ProviderHttpError);
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    await expect(provider.lookup(lookup(), context())).rejects.toThrow('fetch failed');
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ nope: true })));
    await expect(provider.lookup(lookup(), context())).rejects.toThrow('unexpected document');
  });

  it('gives up after its timeout (10 s; shortened here)', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const { instance } = limiter();
    const provider = new MusicBrainzProvider(config, instance);
    expect(provider.timeoutMs).toBe(10_000);
    provider.timeoutMs = 20;
    await expect(provider.lookup(lookup(), context())).rejects.toThrow(
      'MusicBrainz did not answer within 0.02 s',
    );
  });
});

describe('RateLimiter', () => {
  it('spaces calls by the interval and lets a late call through at once', async () => {
    const clock = { now: 5000 };
    const waits: number[] = [];
    const gate = new RateLimiter(
      1000,
      () => clock.now,
      (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    );
    await gate.wait();
    await gate.wait();
    await gate.wait();
    expect(waits).toEqual([1000, 2000]);
    clock.now = 20_000;
    await gate.wait();
    expect(waits).toEqual([1000, 2000]);
  });
});
