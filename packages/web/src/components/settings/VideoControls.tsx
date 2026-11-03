import { countOf, type SubtitlesStatus, type VideoSettings } from '@mytube/shared';
import { useId } from 'react';
import { useFetchSubtitles, useSubtitlesStatus } from '../../api/subtitles';
import { apiErrorMessage } from '../../api/client';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { SettingsNote } from '../ui/SettingsCard';
import { ToggleRow } from '../ui/Toggle';
import { LanguageMultiSelect } from './LanguageMultiSelect';

const deliveryOptions = [
  { value: 'embedded', label: 'embedded' },
  { value: 'sidecar', label: 'sidecar files' },
] as const satisfies readonly { value: 'embedded' | 'sidecar'; label: string }[];

/** The subtitle fields of Settings → Video, as a `PATCH /api/settings` `video` group. */
export type SubtitlePatch = Partial<
  Pick<VideoSettings, 'subtitleLanguages' | 'subtitlesEmbedded' | 'autoSubtitles'>
>;

export interface SubtitlesControlProps {
  languages: readonly string[];
  embedded: boolean;
  onChange: (patch: SubtitlePatch) => void;
}

/**
 * The Video → Format "Subtitles" value: the picked languages (`LanguageMultiSelect`, none for
 * no subtitles) and whether they are embedded or written as sidecar files. The row's label goes
 * to the language picker; the delivery select names itself.
 */
export function SubtitlesControl({ languages, embedded, onChange }: SubtitlesControlProps) {
  // Its own id: without one the select would take the row's, which belongs to the picker.
  const deliveryId = useId();
  return (
    <div className="flex flex-wrap items-start gap-2">
      <LanguageMultiSelect
        value={languages}
        onChange={(subtitleLanguages) => onChange({ subtitleLanguages })}
      />
      <Select
        id={deliveryId}
        label="Subtitle files"
        options={deliveryOptions}
        value={embedded ? 'embedded' : 'sidecar'}
        disabled={languages.length === 0}
        onChange={(choice) => onChange({ subtitlesEmbedded: choice === 'embedded' })}
      />
    </div>
  );
}

export interface AutoSubtitlesRowProps {
  checked: boolean;
  /** No languages means no subtitles of any kind, so the toggle has nothing to act on. */
  disabled?: boolean;
  onChange: (patch: SubtitlePatch) => void;
}

/** "Download generated subtitles" (`video.autoSubtitles`, yt-dlp `--write-auto-subs`). */
export function AutoSubtitlesRow({ checked, disabled, onChange }: AutoSubtitlesRowProps) {
  return (
    <ToggleRow
      label="Download generated subtitles"
      description="YouTube's automatic captions, for languages without uploaded subtitles. Machine translations are skipped."
      checked={checked}
      disabled={disabled}
      onChange={(autoSubtitles) => onChange({ autoSubtitles })}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` local time of an ISO timestamp. */
function clock(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The catch-up line under the subtitle settings: how many videos on disk never had a subtitle
 * run with the picked languages, and what the queue is doing about it.
 */
export function subtitlesCatchUpText(
  status: SubtitlesStatus | undefined,
  languages: readonly string[],
): string {
  if (languages.length === 0) return 'No languages picked: nothing is fetched.';
  if (!status) return 'Counting videos without subtitles…';
  const parts: string[] = [];
  parts.push(
    status.missing === 0
      ? 'Every video on disk had a subtitle run with these languages.'
      : `${countOf(status.missing, 'video')} on disk without a subtitle run for these languages.`,
  );
  if (status.pausedUntil) {
    parts.push(`YouTube rate-limited captions: the queue resumes at ${clock(status.pausedUntil)}.`);
  } else if (status.queued > 0) {
    parts.push(`${countOf(status.queued, 'subtitle job')} queued, one at a time.`);
  }
  return parts.join(' ');
}

export interface SubtitlesCatchUpRowProps {
  languages: readonly string[];
}

/**
 * "Fetch subtitles": queues a subtitle job for every video on disk that never had one with the
 * current languages (`POST /api/subtitles/fetch-missing`). Subtitles are fetched one video at a
 * time, with a gap between fetches, and a rate limit pauses the queue (backend skill
 * "Subtitles"); the line follows the status while jobs run.
 */
export function SubtitlesCatchUpRow({ languages }: SubtitlesCatchUpRowProps) {
  const status = useSubtitlesStatus();
  const fetchMissing = useFetchSubtitles();
  let result: string | undefined;
  if (fetchMissing.isPending) result = 'Queuing…';
  else if (fetchMissing.isError) {
    result = apiErrorMessage(fetchMissing.error, 'Could not queue the subtitle jobs.');
  } else if (fetchMissing.data) {
    result =
      fetchMissing.data.queued === 0 ? 'Nothing to queue.' : `Queued ${fetchMissing.data.queued}.`;
  }
  const missing = status.data?.missing ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-[14px]">
      <div className="min-w-0 flex-1 basis-[280px]">
        <div className="font-sans text-[14px] font-semibold text-ink">Videos without subtitles</div>
        <SettingsNote size="small" role="status">
          {subtitlesCatchUpText(status.data, languages)}
        </SettingsNote>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outlined"
          disabled={languages.length === 0 || missing === 0 || fetchMissing.isPending}
          onClick={() => fetchMissing.mutate()}
        >
          Fetch subtitles
        </Button>
        <div role="status">{result && <SettingsNote size="small">{result}</SettingsNote>}</div>
      </div>
    </div>
  );
}
