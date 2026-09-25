import { DiscogsToken, type MetadataProviders } from '@mytube/shared';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { SettingsCard, SettingsNote } from '../ui/SettingsCard';
import { TextValueInput } from '../ui/TextValueInput';
import { ToggleRow } from '../ui/Toggle';
import { schemaError, textOrNull } from './fields';

/** Error for a Discogs token that cannot be saved; an empty box clears it. */
export function validateDiscogsToken(text: string): string | undefined {
  return text === '' ? undefined : schemaError(DiscogsToken, text);
}

/** The note under the card, or undefined: Discogs switched on without a token does nothing. */
export function discogsNote(providers: MetadataProviders): string | undefined {
  const { discogs } = providers;
  return discogs.enabled && discogs.token === null
    ? 'Discogs is skipped until a token is set.'
    : undefined;
}

export interface MetadataProvidersCardProps {
  value: MetadataProviders;
  /** Saves the whole value (it is one setting). */
  onChange: (providers: MetadataProviders) => void;
}

/**
 * Settings → Music → Metadata providers (not in the handoff, which predates the chain): the
 * MusicBrainz and Discogs toggles (off by default) and the Discogs personal access token in a
 * masked Space Mono value box. yt-dlp's own tags are always written; these providers fill in
 * the album, numbers and year after each download (backend skill "Metadata").
 */
export function MetadataProvidersCard({ value, onChange }: MetadataProvidersCardProps) {
  const note = discogsNote(value);
  return (
    <SettingsCard title="Metadata providers">
      <SettingsNote size="small">
        YouTube Music's tags are always written. Enabled providers are asked after each download, in
        this order, and fill in the album, track and disc numbers and year when they find a
        confident match.
      </SettingsNote>
      <ToggleRow
        label="MusicBrainz"
        description="Looks tracks up on musicbrainz.org, one request per second."
        checked={value.musicbrainz.enabled}
        onChange={(enabled) => onChange({ ...value, musicbrainz: { enabled } })}
      />
      <ToggleRow
        label="Discogs"
        description="Looks tracks up on discogs.com. Needs a personal access token."
        checked={value.discogs.enabled}
        onChange={(enabled) => onChange({ ...value, discogs: { ...value.discogs, enabled } })}
      />
      <KeyValueGrid>
        <KeyValueRow label="Discogs token">
          <TextValueInput
            secret
            value={value.discogs.token ?? ''}
            placeholder="none"
            validate={validateDiscogsToken}
            onCommit={(text) =>
              onChange({ ...value, discogs: { ...value.discogs, token: textOrNull(text) } })
            }
          />
        </KeyValueRow>
      </KeyValueGrid>
      {note && (
        <SettingsNote size="small" role="status">
          {note}
        </SettingsNote>
      )}
    </SettingsCard>
  );
}
