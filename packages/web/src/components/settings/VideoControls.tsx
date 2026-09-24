import { DEFAULT_SETTINGS, VideoSettings } from '@mytube/shared';
import { useId, useState } from 'react';
import { NumberInput } from '../ui/NumberInput';
import { Select } from '../ui/Select';
import { TextValueInput } from '../ui/TextValueInput';
import { Toggle } from '../ui/Toggle';
import { Body } from '../ui/typography';
import { formatLanguageList, parseLanguageList, schemaError } from './fields';

/** Error message for a subtitle language list that cannot be saved. */
export function validateLanguageList(text: string): string | undefined {
  return schemaError(VideoSettings.shape.subtitleLanguages, parseLanguageList(text));
}

const deliveryOptions = [
  { value: 'embedded', label: 'embedded' },
  { value: 'sidecar', label: 'sidecar files' },
] as const satisfies readonly { value: 'embedded' | 'sidecar'; label: string }[];

export interface SubtitlesControlProps {
  languages: readonly string[];
  embedded: boolean;
  onChange: (patch: { subtitleLanguages?: string[]; subtitlesEmbedded?: boolean }) => void;
}

/**
 * The Video → Format "Subtitles" value (handoff `en, nl · embedded`): a comma-separated list
 * of language codes (empty for none) and whether they are embedded or written as sidecar
 * files. The list takes the row's label; the delivery select names itself.
 */
export function SubtitlesControl({ languages, embedded, onChange }: SubtitlesControlProps) {
  // Its own id: without one the select would take the row's, which belongs to the list.
  const deliveryId = useId();
  return (
    <div className="flex flex-wrap items-start gap-2">
      <TextValueInput
        className="w-full wide:w-auto"
        value={formatLanguageList(languages)}
        placeholder="none"
        validate={validateLanguageList}
        onCommit={(text) => onChange({ subtitleLanguages: parseLanguageList(text) })}
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

const KEEP_DAYS_MIN = 1;
const KEEP_DAYS_MAX = 3650;
const DEFAULT_KEEP_DAYS = DEFAULT_SETTINGS.video.keepDays ?? 90;

export interface KeepDaysControlProps {
  /** `video.keepDays`; null keeps videos forever. */
  value: number | null;
  onChange: (keepDays: number | null) => void;
}

/**
 * "Keep videos for 90 days" with a "forever" switch for null. While forever is on the number is
 * disabled; switching it off restores the last number entered on this page (else 90, the default).
 */
export function KeepDaysControl({ value, onChange }: KeepDaysControlProps) {
  const foreverId = useId();
  const [lastDays, setLastDays] = useState(value ?? DEFAULT_KEEP_DAYS);
  const forever = value === null;
  return (
    <div className="flex items-center gap-3">
      {/* Full width on narrow (like every value box), content width on wide. */}
      <div className="min-w-0 flex-1 wide:flex-none">
        <NumberInput
          min={KEEP_DAYS_MIN}
          max={KEEP_DAYS_MAX}
          value={value ?? lastDays}
          disabled={forever}
          className="disabled:opacity-50"
          onChange={(days) => {
            setLastDays(days);
            onChange(days);
          }}
        />
      </div>
      <Body as="span" muted>
        days
      </Body>
      <Toggle
        id={foreverId}
        label="Keep videos forever"
        className="wide:ml-3"
        checked={forever}
        onChange={(on) => onChange(on ? null : lastDays)}
      />
      <label htmlFor={foreverId} className="cursor-pointer text-body text-muted">
        forever
      </label>
    </div>
  );
}
