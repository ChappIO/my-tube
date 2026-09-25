import {
  type DataSettings,
  LOG_LEVELS,
  type MaintenanceStatus,
  type SystemAction,
} from '@mytube/shared';
import {
  SYSTEM_LOGS_URL,
  useMaintenanceStatus,
  useSystemAction,
  useSystemInfo,
} from '../../api/system';
import { lastBackupLabel } from '../../format';
import { useNow } from '../../use-now';
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

/** Whether the job behind an action is queued or running. */
function actionActive(status: MaintenanceStatus | undefined, action: SystemAction): boolean {
  return action === 'backup' ? status?.backup.active === true : status?.rescan.active === true;
}

/**
 * Settings → Advanced → Data: the config mount (read-only, from env), the last backup
 * (`today 04:00`, from `GET /api/system/maintenance`), the log level, and Back up now /
 * Download logs / Rescan libraries. After a click the line next to the buttons follows the job:
 * the answer (`Backup queued.`, `A rescan is already running.`), `running.` while it is queued or
 * running, then `finished.` (the outcome is in Activity → History).
 */
export function DataCard({ settings, onChange }: DataCardProps) {
  const { data: info } = useSystemInfo();
  const { data: maintenance } = useMaintenanceStatus();
  const action = useSystemAction();
  const now = useNow();

  let result: string | undefined;
  if (action.isPending && action.variables) result = `${ACTION_LABELS[action.variables]}…`;
  else if (action.data) {
    const { action: name, ok, message } = action.data;
    const state = !ok ? message : actionActive(maintenance, name) ? 'running.' : 'finished.';
    result = `${ACTION_LABELS[name]}: ${state}`;
  } else if (action.isError) result = 'The request failed. Is the server running?';

  return (
    <SettingsCard title="Data">
      <KeyValueGrid>
        <KeyValueRow label="Config and database" control={false}>
          <KeyValueText>{info?.configDir ?? '…'}</KeyValueText>
        </KeyValueRow>
        <KeyValueRow label="Last backup" control={false}>
          <KeyValueText>
            {maintenance
              ? lastBackupLabel(maintenance.backup.last?.at ?? null, new Date(now))
              : '…'}
          </KeyValueText>
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
