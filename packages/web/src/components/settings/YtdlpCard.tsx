import type { YtdlpSettings, YtdlpStatus } from '@mytube/shared';
import { isYtdlpBusy, useYtdlpAction, useYtdlpStatus, ytdlpSummary } from '../../api/ytdlp';
import { Button } from '../ui/Button';
import { SettingsCard, SettingsRow } from '../ui/SettingsCard';
import { ToggleRow } from '../ui/Toggle';
import { Meta } from '../ui/typography';

export interface YtdlpCardProps {
  /** `settings.ytdlp`; the toggle reads from it so it flips immediately. */
  settings: YtdlpSettings;
  /** Saves a change to the `ytdlp` group (the tab's `useUpdateSettings`). */
  onChange: (patch: Partial<YtdlpSettings>) => void;
}

/** `Installed 2026.09.22 · up to date · auto-update on`, with the auto-update flag from settings. */
function statusLine(status: YtdlpStatus, autoUpdate: boolean): string {
  const summary = ytdlpSummary({ ...status, autoUpdate });
  if (status.installedVersion) return `Installed ${status.installedVersion} · ${summary}`;
  return status.state === 'not_installed'
    ? `Not installed · auto-update ${autoUpdate ? 'on' : 'off'}`
    : `Not installed · ${summary}`;
}

function intervalText(hours: number): string {
  return hours === 1 ? 'every hour' : `every ${hours} hours`;
}

/**
 * Settings → Advanced → yt-dlp (handoff Screen 6): installed version and state, Check now, and
 * the auto-update toggle. Check now installs a newer release right away when auto-update is
 * on, and only looks when it is off; then an "Update to" button offers the install.
 */
export function YtdlpCard({ settings, onChange }: YtdlpCardProps) {
  const { data: status, isError } = useYtdlpStatus();
  const action = useYtdlpAction();
  const busy = action.isPending || (status !== undefined && isYtdlpBusy(status.state));

  let line = 'Loading status…';
  if (status) line = statusLine(status, settings.autoUpdate);
  else if (isError) line = 'Status unavailable.';

  return (
    <SettingsCard title="yt-dlp">
      <SettingsRow description={line}>
        <div className="flex flex-wrap gap-2">
          {status?.state === 'update_available' && status.latestVersion && (
            <Button variant="outlined" disabled={busy} onClick={() => action.mutate('update')}>
              Update to {status.latestVersion}
            </Button>
          )}
          <Button
            variant="outlined"
            disabled={busy || !status}
            onClick={() => action.mutate(settings.autoUpdate ? 'update' : 'check')}
          >
            {action.isPending ? 'Checking…' : 'Check now'}
          </Button>
        </div>
      </SettingsRow>
      {status?.error && (
        <Meta as="p" tone="red">
          {status.error}
        </Meta>
      )}
      <ToggleRow
        label="Update automatically"
        description={`Checks ${intervalText(settings.updateIntervalHours)}. Downloads fail fast when yt-dlp is stale, so keep this on.`}
        checked={settings.autoUpdate}
        onChange={(autoUpdate) => onChange({ autoUpdate })}
      />
    </SettingsCard>
  );
}
