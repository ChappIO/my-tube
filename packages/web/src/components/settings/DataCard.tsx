import { type DataSettings, LOG_LEVELS, type SystemAction } from '@mytube/shared';
import { SYSTEM_LOGS_URL, useSystemAction, useSystemInfo } from '../../api/system';
import { Button } from '../ui/Button';
import { KeyValueGrid, KeyValueRow, KeyValueText } from '../ui/KeyValueGrid';
import { Select } from '../ui/Select';
import { SettingsCard, SettingsNote } from '../ui/SettingsCard';
import { optionsOf } from './fields';

const logLevelOptions = optionsOf(LOG_LEVELS);

const ACTION_LABELS: Record<SystemAction, string> = {
  backup: 'Back up now',
  rescan: 'Rescan libraries',
};

export interface DataCardProps {
  settings: DataSettings;
  /** Saves a change to the `data` group. */
  onChange: (patch: Partial<DataSettings>) => void;
}

/**
 * Settings → Advanced → Data: the config mount (read-only, from env), the last backup, the log
 * level, and Back up now / Download logs / Rescan libraries. Backups and rescans are Stage 7:
 * until then their endpoints answer 501 and the card shows that answer under the buttons.
 * "Last backup" reads "never" until backups exist.
 */
export function DataCard({ settings, onChange }: DataCardProps) {
  const { data: info } = useSystemInfo();
  const action = useSystemAction();

  let result: string | undefined;
  if (action.isPending && action.variables) result = `${ACTION_LABELS[action.variables]}…`;
  else if (action.data) result = `${ACTION_LABELS[action.data.action]}: ${action.data.message}`;
  else if (action.isError) result = 'The request failed. Is the server running?';

  return (
    <SettingsCard title="Data">
      <KeyValueGrid>
        <KeyValueRow label="Config and database" control={false}>
          <KeyValueText>{info?.configDir ?? '…'}</KeyValueText>
        </KeyValueRow>
        <KeyValueRow label="Last backup" control={false}>
          <KeyValueText>never</KeyValueText>
        </KeyValueRow>
        <KeyValueRow label="Log level">
          <Select
            options={logLevelOptions}
            value={settings.logLevel}
            onChange={(logLevel) => onChange({ logLevel })}
          />
        </KeyValueRow>
      </KeyValueGrid>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          disabled={action.isPending}
          onClick={() => action.mutate('backup')}
        >
          {ACTION_LABELS.backup}
        </Button>
        {/* The endpoint answers with an attachment, so navigating to it downloads in place. */}
        <Button variant="outlined" onClick={() => window.location.assign(SYSTEM_LOGS_URL)}>
          Download logs
        </Button>
        <Button
          variant="outlined"
          disabled={action.isPending}
          onClick={() => action.mutate('rescan')}
        >
          {ACTION_LABELS.rescan}
        </Button>
        {/* Always rendered so screen readers announce each new result; wraps on narrow. */}
        <div role="status" className="self-center">
          {result && <SettingsNote size="small">{result}</SettingsNote>}
        </div>
      </div>
    </SettingsCard>
  );
}
