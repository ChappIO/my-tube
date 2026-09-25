import { DEFAULT_SETTINGS, type MusicSettings } from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { MetadataChain, type TagSink } from './metadata-chain.js';
import {
  type MetadataProvider,
  type ProviderMatch,
  type TrackLookup,
  changedFields,
  describeSearch,
  lookupTitles,
  mergeTags,
} from './provider.js';
import type { TrackTags } from './ytdlp-tags.js';

const BASELINE: TrackTags = {
  title: 'Red Room',
  artist: 'Hiatus Kaiyote',
  album: 'Mood Valiant',
  albumArtist: 'Hiatus Kaiyote',
  trackNumber: 9,
  discNumber: null,
  year: 2021,
};

const TRACK: TrackLookup = {
  youtubeId: 'abc',
  tags: BASELINE,
  durationSeconds: 232,
  uploadTitle: null,
  featuredArtists: [],
};

function match(
  tags: ProviderMatch['tags'],
  confidence: number,
  extra: Partial<ProviderMatch> = {},
) {
  return { tags, confidence, summary: 'test', ...extra } satisfies ProviderMatch;
}

describe('mergeTags', () => {
  it('takes the first confident value per field and keeps title and artist', () => {
    const merged = mergeTags(BASELINE, [
      match({ album: 'Mood Valiant (Deluxe)', year: 2022 }, 0.95),
      match({ album: 'Other', discNumber: 1, year: 1999 }, 0.9),
    ]);
    expect(merged).toEqual({
      ...BASELINE,
      album: 'Mood Valiant (Deluxe)',
      year: 2022,
      discNumber: 1,
    });
  });

  it('keeps the baseline where nobody is confident', () => {
    expect(mergeTags(BASELINE, [match({ album: 'Guess', year: 1990 }, 0.5)])).toEqual(BASELINE);
    expect(mergeTags(BASELINE, [])).toEqual(BASELINE);
  });

  it('uses per-field confidence and skips empty values', () => {
    const merged = mergeTags(BASELINE, [
      match({ album: 'Not sure', trackNumber: 3, albumArtist: '' }, 0.95, {
        fieldConfidence: { album: 0.4 },
      }),
      match({ album: 'Sure' }, 0.8),
    ]);
    expect(merged).toMatchObject({ album: 'Sure', trackNumber: 3, albumArtist: 'Hiatus Kaiyote' });
  });

  it('lists the enriched fields that changed', () => {
    expect(changedFields(BASELINE, { ...BASELINE, year: 2020, title: 'x' })).toEqual(['year']);
  });
});

function provider(
  name: string,
  answer: ProviderMatch | null | Error,
  calls: string[],
): MetadataProvider {
  return {
    name,
    label: name.toUpperCase(),
    enabled: (music: MusicSettings) =>
      name === 'musicbrainz'
        ? music.metadataProviders.musicbrainz.enabled
        : music.metadataProviders.discogs.enabled,
    lookup: () => {
      calls.push(name);
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve({ match: answer, tried: ['Red Room'] });
    },
  };
}

function settings(musicbrainz: boolean, discogs: boolean): MusicSettings {
  return {
    ...DEFAULT_SETTINGS.music,
    metadataProviders: {
      musicbrainz: { enabled: musicbrainz },
      discogs: { enabled: discogs, token: discogs ? 'secret-token' : null },
    },
  };
}

function writer(fail = false) {
  const writes: { file: string; tags: Partial<TrackTags> }[] = [];
  const sink: TagSink = {
    write: (file, tags) => {
      writes.push({ file, tags });
      return fail ? Promise.reject(new Error('disk full')) : Promise.resolve();
    },
  };
  return { sink, writes };
}

describe('describeSearch', () => {
  it('names the titles tried and the other artists searched', () => {
    const track = { ...TRACK, tags: { ...BASELINE, title: 'Password', artist: 'MDK' } };
    expect(
      describeSearch(track, {
        match: null,
        tried: ['Password', 'MDK x t+pazolite - Password'],
        alsoSearched: ['t+pazolite'],
      }),
    ).toBe('"Password" by MDK with t+pazolite (also tried "MDK x t+pazolite - Password")');
    expect(describeSearch(track, { match: null, tried: ['Password'] })).toBe('"Password" by MDK');
  });
});

describe('lookupTitles', () => {
  it('is the cleaned title, then a different upload title', () => {
    expect(lookupTitles({ ...TRACK, uploadTitle: 'Hiatus Kaiyote - Red Room' })).toEqual([
      'Red Room',
      'Hiatus Kaiyote - Red Room',
    ]);
    expect(lookupTitles({ ...TRACK, uploadTitle: 'Red Room' })).toEqual(['Red Room']);
    expect(lookupTitles(TRACK)).toEqual(['Red Room']);
  });
});

describe('MetadataChain', () => {
  it('asks nobody and writes nothing when no provider is enabled', async () => {
    const calls: string[] = [];
    const { sink, writes } = writer();
    const chain = new MetadataChain(
      [provider('musicbrainz', match({ year: 1 }, 1), calls), provider('discogs', null, calls)],
      sink,
    );
    const log: string[] = [];
    expect(chain.active(settings(false, false))).toEqual([]);
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(false, false),
      log: (line) => log.push(line),
    });
    expect(result).toBeNull();
    expect(calls).toEqual([]);
    expect(writes).toEqual([]);
    expect(log).toEqual([]);
  });

  it('skips disabled providers, merges in order and writes the changed fields', async () => {
    const calls: string[] = [];
    const { sink, writes } = writer();
    const chain = new MetadataChain(
      [
        provider('musicbrainz', match({ discNumber: 1, year: 2021 }, 0.95), calls),
        provider('discogs', match({ discNumber: 2 }, 0.9), calls),
      ],
      sink,
    );
    const log: string[] = [];
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(true, false),
      log: (line) => log.push(line),
    });
    expect(calls).toEqual(['musicbrainz']);
    expect(result).toEqual({ tags: { ...BASELINE, discNumber: 1 }, written: ['discNumber'] });
    expect(writes).toEqual([{ file: '/m/a.m4a', tags: { ...BASELINE, discNumber: 1 } }]);
    expect(log).toEqual([
      'MUSICBRAINZ: disc 1, year 2021 for "Red Room" by Hiatus Kaiyote (confidence 0.95; test)',
      'metadata: wrote disc 1',
    ]);
  });

  it('logs a failing provider, goes on with the next and never writes a token', async () => {
    const calls: string[] = [];
    const { sink } = writer();
    const chain = new MetadataChain(
      [
        provider('musicbrainz', new Error('MusicBrainz answered HTTP 503'), calls),
        provider('discogs', match({ year: 2020 }, 0.9), calls),
      ],
      sink,
    );
    const log: string[] = [];
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(true, true),
      log: (line) => log.push(line),
    });
    expect(calls).toEqual(['musicbrainz', 'discogs']);
    expect(result?.tags.year).toBe(2020);
    expect(log[0]).toBe(
      'MUSICBRAINZ: lookup failed (MusicBrainz answered HTTP 503); no enrichment',
    );
    expect(log.join('\n')).not.toContain('secret-token');
  });

  it('keeps the baseline and writes nothing when nobody is confident', async () => {
    const calls: string[] = [];
    const { sink, writes } = writer();
    const chain = new MetadataChain(
      [
        provider('musicbrainz', match({}, 0, { summary: 'no release named "X"' }), calls),
        provider('discogs', null, calls),
      ],
      sink,
    );
    const log: string[] = [];
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(true, true),
      log: (line) => log.push(line),
    });
    expect(result).toEqual({ tags: BASELINE, written: [] });
    expect(writes).toEqual([]);
    expect(log).toEqual([
      'MUSICBRAINZ: no confident match for "Red Room" by Hiatus Kaiyote (no release named "X")',
      'DISCOGS: no match for "Red Room" by Hiatus Kaiyote',
      'metadata: tags unchanged',
    ]);
  });

  it('survives a failed write: the file keeps yt-dlp tags', async () => {
    const { sink } = writer(true);
    const chain = new MetadataChain([provider('musicbrainz', match({ year: 1999 }, 1), [])], sink);
    const log: string[] = [];
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(true, false),
      log: (line) => log.push(line),
    });
    expect(result).toEqual({ tags: BASELINE, written: [] });
    expect(log.at(-1)).toBe("metadata: could not write the tags (disk full); yt-dlp's stay");
  });

  it('stops quietly when the job is cancelled during a lookup', async () => {
    const controller = new AbortController();
    const { sink, writes } = writer();
    const aborting: MetadataProvider = {
      name: 'musicbrainz',
      label: 'MB',
      enabled: () => true,
      lookup: () => {
        controller.abort('cancel');
        return Promise.reject(new Error('aborted'));
      },
    };
    const chain = new MetadataChain([aborting], sink);
    const result = await chain.enrich('/m/a.m4a', TRACK, {
      settings: settings(true, false),
      signal: controller.signal,
      log: () => undefined,
    });
    expect(result).toBeNull();
    expect(writes).toEqual([]);
  });
});
