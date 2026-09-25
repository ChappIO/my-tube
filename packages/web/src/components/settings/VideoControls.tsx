import { VideoSettings } from '@mytube/shared';
import { useId } from 'react';
import { Select } from '../ui/Select';
import { TextValueInput } from '../ui/TextValueInput';
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
