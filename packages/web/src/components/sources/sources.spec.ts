import {
  DEFAULT_MUSIC_RULES,
  DEFAULT_VIDEO_RULES,
  type ResolvedSource,
  type Source,
} from '@mytube/shared';
import { describe, expect, it } from 'vitest';
import { draftFromRules, newRulesDraft, rulesFromDraft, type VideoRulesDraft } from './rules-draft';
import { kindInLibrary, resolvedMeta, sourceMeta, videoLibrarySummary } from './source-text';

function videoDraft(patch: Partial<VideoRulesDraft> = {}): VideoRulesDraft {
  const draft = draftFromRules(DEFAULT_VIDEO_RULES);
  if (draft.library !== 'video') throw new Error('expected a video draft');
  return { ...draft, ...patch };
}

describe('rules drafts', () => {
  it('round-trips the defaults', () => {
    expect(rulesFromDraft(draftFromRules(DEFAULT_VIDEO_RULES), 'channel')).toEqual({
      ok: true,
      rules: DEFAULT_VIDEO_RULES,
    });
    expect(rulesFromDraft(draftFromRules(DEFAULT_MUSIC_RULES), 'artist')).toEqual({
      ok: true,
      rules: DEFAULT_MUSIC_RULES,
    });
  });

  it('starts new video sources from the Settings → Video defaults', () => {
    const draft = newRulesDraft('video', { keepDays: null, skipShorts: false });
    expect(draft).toMatchObject({ skipShorts: false, keep: false, keepDays: 90 });
    expect(newRulesDraft('video', { keepDays: 30, skipShorts: true })).toMatchObject({
      keep: true,
      keepDays: 30,
    });
    expect(newRulesDraft('music')).toEqual(DEFAULT_MUSIC_RULES);
  });

  it('remembers N while keep is off and saves null', () => {
    const draft = draftFromRules({ ...DEFAULT_VIDEO_RULES, keepDays: null }, 45);
    expect(draft).toMatchObject({ keep: false, keepDays: 45 });
    const result = rulesFromDraft(draft, 'channel');
    expect(result.ok && result.rules.library === 'video' && result.rules.keepDays).toBeNull();
    const on = rulesFromDraft(videoDraft({ keep: true, keepDays: 7 }), 'channel');
    expect(on.ok && on.rules.library === 'video' && on.rules.keepDays).toBe(7);
  });

  it('maps the inline fields and trims the title', () => {
    const result = rulesFromDraft(
      videoDraft({ titleOn: true, title: '  Artemis ', afterOn: true, after: '2026-01-01' }),
      'channel',
    );
    expect(result).toMatchObject({
      ok: true,
      rules: { titleFilter: 'Artemis', publishedAfter: '2026-01-01' },
    });
    // Unchecked rows ignore their text.
    const off = rulesFromDraft(videoDraft({ title: 'x', after: 'nonsense' }), 'channel');
    expect(off).toMatchObject({ ok: true, rules: { titleFilter: null, publishedAfter: null } });
  });

  it('rejects checked rows without a usable value', () => {
    expect(rulesFromDraft(videoDraft({ titleOn: true, title: ' ' }), 'channel').ok).toBe(false);
    expect(rulesFromDraft(videoDraft({ afterOn: true, after: '' }), 'channel').ok).toBe(false);
    expect(
      rulesFromDraft(videoDraft({ titleOn: true, title: 'x'.repeat(201) }), 'channel').ok,
    ).toBe(false);
  });

  it('keeps sync order for playlists only', () => {
    const draft = videoDraft({ syncOrder: true });
    expect(rulesFromDraft(draft, 'playlist')).toMatchObject({ rules: { syncOrder: true } });
    expect(rulesFromDraft(draft, 'channel')).toMatchObject({ rules: { syncOrder: false } });
  });
});

const source: Source = {
  id: 1,
  library: 'video',
  kind: 'channel',
  youtubeId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
  url: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ',
  name: 'NASA',
  avatarUrl: null,
  subscribed: true,
  rules: DEFAULT_VIDEO_RULES,
  lastCheckedAt: null,
  itemCount: 0,
  sizeBytes: 0,
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

const resolved: ResolvedSource = {
  kind: 'channel',
  library: 'video',
  youtubeId: 'UCLA_DiR1FfKNvjuUpBHmylQ',
  url: 'https://www.youtube.com/channel/UCLA_DiR1FfKNvjuUpBHmylQ',
  name: 'NASA',
  avatarUrl: null,
  itemCount: null,
  uploadsPerWeek: 3.24,
  latestItemAt: null,
  resolvedFrom: null,
  alreadyAdded: null,
};

describe('source text', () => {
  it('writes the row meta, leaving out counts that are still 0', () => {
    expect(sourceMeta(source)).toBe('Channel');
    expect(sourceMeta({ ...source, itemCount: 214, sizeBytes: 38e9 })).toBe(
      'Channel · 214 videos · 38 GB',
    );
    expect(sourceMeta({ ...source, kind: 'playlist', itemCount: 1 })).toBe('Playlist · 1 video');
    expect(sourceMeta({ ...source, library: 'music', kind: 'artist', itemCount: 12 })).toBe(
      'Artist · 12 tracks',
    );
  });

  it('writes the source card meta for the chosen library', () => {
    expect(resolvedMeta(resolved, 'video')).toBe('channel · 3.2 uploads/week');
    expect(resolvedMeta({ ...resolved, uploadsPerWeek: null }, 'video')).toBe(
      'channel · 0 uploads/week',
    );
    expect(resolvedMeta(resolved, 'music')).toBe('artist');
    const playlist = { ...resolved, kind: 'playlist' as const, itemCount: 9 };
    expect(resolvedMeta(playlist, 'video')).toBe('playlist · 9 videos');
    expect(resolvedMeta(playlist, 'music')).toBe('playlist · 9 tracks');
  });

  it('maps kinds to the library like the API', () => {
    expect(kindInLibrary('channel', 'music')).toBe('artist');
    expect(kindInLibrary('artist', 'video')).toBe('channel');
    expect(kindInLibrary('playlist', 'music')).toBe('playlist');
  });

  it('summarises the video library', () => {
    expect(videoLibrarySummary([])).toBe('0 channels');
    expect(
      videoLibrarySummary([
        { ...source, itemCount: 200, sizeBytes: 100e9 },
        { ...source, id: 2 },
        { ...source, id: 3, kind: 'playlist', itemCount: 168, sizeBytes: 30.4e9 },
      ]),
    ).toBe('2 channels · 1 playlist · 368 videos · 130 GB');
  });
});
