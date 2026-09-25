import type { Library, SourceKind, SourceOptions } from '@mytube/shared';
import { useId } from 'react';
import { CheckboxRow } from '../ui/CheckboxRow';
import { FieldLabel } from '../ui/typography';

export interface SourceOptionRowsProps {
  library: Library;
  kind: SourceKind;
  options: SourceOptions;
  onChange: (options: SourceOptions) => void;
}

/**
 * The options that are not rules, as checkbox rows under the builder: "Embed cover art" for
 * music sources and "Sync in playlist order" for playlists. Renders nothing when neither
 * applies (a video channel).
 */
export function SourceOptionRows({ library, kind, options, onChange }: SourceOptionRowsProps) {
  const labelId = useId();
  const music = library === 'music';
  const playlist = kind === 'playlist';
  if (!music && !playlist) return null;
  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-2">
      <FieldLabel as="div" id={labelId}>
        Options
      </FieldLabel>
      {music && (
        <CheckboxRow
          label="Embed cover art"
          hint="from YouTube Music"
          checked={options.embedCoverArt}
          onChange={(embedCoverArt) => onChange({ ...options, embedCoverArt })}
        />
      )}
      {playlist && (
        <CheckboxRow
          label="Sync in playlist order"
          hint="numbered by position"
          checked={options.syncOrder}
          onChange={(syncOrder) => onChange({ ...options, syncOrder })}
        />
      )}
    </div>
  );
}
