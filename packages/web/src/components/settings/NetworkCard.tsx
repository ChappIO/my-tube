import { NetworkSettings } from '@mytube/shared';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { SettingsCard } from '../ui/SettingsCard';
import { TextValueInput } from '../ui/TextValueInput';
import { schemaError, textOrNull } from './fields';

type NetworkField = keyof NetworkSettings;

/** Error message for a Network field's text, validated like the API does (empty is "none"). */
export function validateNetworkField(field: NetworkField, text: string): string | undefined {
  return schemaError(NetworkSettings.shape[field], textOrNull(text));
}

const rows: { field: NetworkField; label: string }[] = [
  { field: 'rateLimit', label: 'Rate limit' },
  { field: 'proxy', label: 'Proxy' },
  { field: 'cookiesFile', label: 'Cookies file' },
];

export interface NetworkCardProps {
  settings: NetworkSettings;
  /** Saves a change to the `network` group. */
  onChange: (patch: Partial<NetworkSettings>) => void;
}

/**
 * Settings → Advanced → Network: rate limit (`500K`, `5M`), proxy URL and cookies file path,
 * passed to every yt-dlp call. An empty box reads "none" and is stored as null.
 */
export function NetworkCard({ settings, onChange }: NetworkCardProps) {
  return (
    <SettingsCard title="Network">
      <KeyValueGrid>
        {rows.map(({ field, label }) => (
          <KeyValueRow key={field} label={label}>
            <TextValueInput
              value={settings[field] ?? ''}
              placeholder="none"
              validate={(text) => validateNetworkField(field, text)}
              onCommit={(text) => onChange({ [field]: textOrNull(text) })}
            />
          </KeyValueRow>
        ))}
      </KeyValueGrid>
    </SettingsCard>
  );
}
