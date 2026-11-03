import { Settings } from '@mytube/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiPatch } from '../../api/client';
import { withLanguage, withoutLanguage } from './language-select';
import type { LanguageMultiSelectProps } from './LanguageMultiSelect';
import type { ToggleRowProps } from '../ui/Toggle';
import {
  AutoSubtitlesRow,
  type SubtitlePatch,
  SubtitlesControl,
  subtitlesCatchUpText,
} from './VideoControls';

// Capture the props the controls hand to the picker and the toggle, to drive them without a DOM.
const captured = vi.hoisted(() => ({
  picker: undefined as LanguageMultiSelectProps | undefined,
  toggle: undefined as ToggleRowProps | undefined,
}));
vi.mock('./LanguageMultiSelect', () => ({
  LanguageMultiSelect: (props: LanguageMultiSelectProps) => {
    captured.picker = props;
    return null;
  },
}));
vi.mock('../ui/Toggle', () => ({
  ToggleRow: (props: ToggleRowProps) => {
    captured.toggle = props;
    return null;
  },
}));

/** The JSON body `useUpdateSettings` sends for a Settings → Video change. */
async function patchBody(patch: SubtitlePatch): Promise<unknown> {
  await apiPatch('/api/settings', { video: patch }, Settings);
  const init = fetchMock.mock.calls.at(-1)![1];
  expect(init?.method).toBe('PATCH');
  const body = init?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON body');
  return JSON.parse(body);
}

const fetchMock = vi.fn<typeof fetch>();

describe('Settings → Video subtitle controls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(() => Promise.resolve(Response.json(Settings.parse({}))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('saves the picked languages in the order picked, on every add and remove', async () => {
    const onChange = vi.fn<(patch: SubtitlePatch) => void>();
    renderToStaticMarkup(<SubtitlesControl languages={['nl']} embedded onChange={onChange} />);
    const picker = captured.picker!;
    expect(picker.value).toEqual(['nl']);

    picker.onChange(withLanguage(picker.value, 'en'));
    picker.onChange(withLanguage(['nl', 'en'], 'pt-BR'));
    picker.onChange(withoutLanguage(['nl', 'en', 'pt-BR'], 'nl'));
    expect(onChange.mock.calls.map(([patch]) => patch)).toEqual([
      { subtitleLanguages: ['nl', 'en'] },
      { subtitleLanguages: ['nl', 'en', 'pt-BR'] },
      { subtitleLanguages: ['en', 'pt-BR'] },
    ]);
    expect(await patchBody(onChange.mock.calls[1]![0])).toEqual({
      video: { subtitleLanguages: ['nl', 'en', 'pt-BR'] },
    });
  });

  it('saves the generated subtitles toggle on change', async () => {
    const onChange = vi.fn<(patch: SubtitlePatch) => void>();
    renderToStaticMarkup(<AutoSubtitlesRow checked onChange={onChange} />);
    expect(captured.toggle?.label).toBe('Download generated subtitles');
    captured.toggle!.onChange(false);
    expect(onChange).toHaveBeenCalledWith({ autoSubtitles: false });
    expect(await patchBody({ autoSubtitles: false })).toEqual({ video: { autoSubtitles: false } });
  });

  it('describes the videos without subtitles and the queue', () => {
    expect(subtitlesCatchUpText(undefined, [])).toBe('No languages picked: nothing is fetched.');
    expect(subtitlesCatchUpText(undefined, ['en'])).toBe('Counting videos without subtitles…');
    expect(subtitlesCatchUpText({ missing: 0, queued: 0, pausedUntil: null }, ['en'])).toBe(
      'Every video on disk had a subtitle run with these languages.',
    );
    expect(subtitlesCatchUpText({ missing: 123, queued: 0, pausedUntil: null }, ['en'])).toBe(
      '123 videos on disk without a subtitle run for these languages.',
    );
    expect(subtitlesCatchUpText({ missing: 1, queued: 1, pausedUntil: null }, ['en'])).toBe(
      '1 video on disk without a subtitle run for these languages. 1 subtitle job queued, one at a time.',
    );
    const until = new Date(2026, 10, 3, 14, 5).toISOString();
    expect(subtitlesCatchUpText({ missing: 5, queued: 5, pausedUntil: until }, ['en'])).toBe(
      '5 videos on disk without a subtitle run for these languages. YouTube rate-limited captions: the queue resumes at 14:05.',
    );
  });
});
