import {
  CHECK_INTERVAL_HOURS,
  DOWNLOADS_AT_ONCE_MAX,
  DOWNLOADS_AT_ONCE_MIN,
  type ThemeChoice,
} from '@mytube/shared';
import { useUpdateSettings } from '../../api/settings';
import { useTheme } from '../../theme';
import { KeyValueGrid, KeyValueRow } from '../ui/KeyValueGrid';
import { NumberInput } from '../ui/NumberInput';
import { Select } from '../ui/Select';
import { SettingsCard, SettingsRow } from '../ui/SettingsCard';
import { TabPills } from '../ui/TabPills';
import { SettingsTab } from './SettingsTab';

// System lets the user return to following the device.
const themeItems: { id: ThemeChoice; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

const intervalOptions = CHECK_INTERVAL_HOURS.map((hours) => ({
  value: hours,
  label: hours === 1 ? 'every hour' : `every ${hours} hours`,
}));

/** Settings → General: Appearance and Subscriptions. Every change saves immediately. */
export function GeneralSettings() {
  const update = useUpdateSettings();
  const { theme } = useTheme();
  return (
    <SettingsTab saveFailed={update.isError}>
      {(settings) => (
        <>
          <SettingsCard title="Appearance">
            <SettingsRow description="Follows the device by default.">
              <TabPills
                size="sm"
                label="Theme"
                items={themeItems}
                value={theme}
                onChange={(choice) => update.mutate({ general: { theme: choice } })}
              />
            </SettingsRow>
          </SettingsCard>
          <SettingsCard title="Subscriptions">
            <KeyValueGrid>
              <KeyValueRow label="Check for new content">
                <Select
                  options={intervalOptions}
                  value={settings.general.checkIntervalHours}
                  onChange={(hours) => update.mutate({ general: { checkIntervalHours: hours } })}
                />
              </KeyValueRow>
              <KeyValueRow label="Downloads at once">
                <NumberInput
                  min={DOWNLOADS_AT_ONCE_MIN}
                  max={DOWNLOADS_AT_ONCE_MAX}
                  value={settings.general.downloadsAtOnce}
                  onChange={(count) => update.mutate({ general: { downloadsAtOnce: count } })}
                />
              </KeyValueRow>
            </KeyValueGrid>
          </SettingsCard>
        </>
      )}
    </SettingsTab>
  );
}
