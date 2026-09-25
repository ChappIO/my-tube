import type { VideoSettings } from '@mytube/shared';
import { useId } from 'react';
import { Select } from '../ui/Select';
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
