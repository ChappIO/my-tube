import type { YtdlpSettings } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { cookiesQueryKey } from '../../api/cookies';
import { useUpdateSettings } from '../../api/settings';
import { ytdlpStatusQueryKey } from '../../api/ytdlp';
import { SettingsNote } from '../ui/SettingsCard';
import { DataCard } from './DataCard';
import { NetworkCard } from './NetworkCard';
import { SettingsTab } from './SettingsTab';
import { YtdlpCard } from './YtdlpCard';

/** Settings → Advanced: yt-dlp, Network and Data, and the mounts footnote. */
export function AdvancedSettings() {
  const update = useUpdateSettings();
  const queryClient = useQueryClient();
  // The yt-dlp status carries the auto-update flag too (sidebar footer); refresh it after a save.
  const saveYtdlp = (patch: Partial<YtdlpSettings>) =>
    update.mutate(
      { ytdlp: patch },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: ytdlpStatusQueryKey }) },
    );
  return (
    <SettingsTab saveFailed={update.isError}>
      {(settings) => (
        <>
          <YtdlpCard settings={settings.ytdlp} onChange={saveYtdlp} />
          <NetworkCard
            settings={settings.network}
            onChange={(patch) =>
              update.mutate(
                { network: patch },
                // A path typed in the Cookies row changes what the cookies status reports.
                { onSettled: () => queryClient.invalidateQueries({ queryKey: cookiesQueryKey }) },
              )
            }
          />
          <DataCard settings={settings.data} onChange={(patch) => update.mutate({ data: patch })} />
          <SettingsNote size="small">
            Paths are container mounts. Change them in your Docker configuration.
          </SettingsNote>
        </>
      )}
    </SettingsTab>
  );
}
