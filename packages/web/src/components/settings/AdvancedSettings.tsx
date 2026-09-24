import type { YtdlpSettings } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateSettings } from '../../api/settings';
import { ytdlpStatusQueryKey } from '../../api/ytdlp';
import { SettingsNote } from '../ui/SettingsCard';
import { SettingsTab } from './SettingsTab';
import { YtdlpCard } from './YtdlpCard';

/** Settings → Advanced: the yt-dlp card. Network and Data cards follow. */
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
          <SettingsNote>Network and data settings follow.</SettingsNote>
        </>
      )}
    </SettingsTab>
  );
}
