import type { Settings } from '@mytube/shared';
import type { ReactNode } from 'react';
import { useSettings } from '../../api/settings';
import { SettingsColumn, SettingsNote } from '../ui/SettingsCard';

export interface SettingsTabProps {
  /** The tab's cards, rendered once settings have loaded. */
  children: (settings: Settings) => ReactNode;
  /** `isError` of the tab's `useUpdateSettings()`; shows the save failure line. */
  saveFailed?: boolean;
}

/**
 * Frame for one Settings tab: the 760px column, plain loading and load-failure lines, and the
 * save-failure line under the cards. Each tab (General, Music, Video, Advanced) renders its
 * cards through it.
 */
export function SettingsTab({ children, saveFailed }: SettingsTabProps) {
  const { data, isPending, isError } = useSettings();
  return (
    <SettingsColumn>
      {data ? children(data) : null}
      {isPending && <SettingsNote role="status">Loading settings.</SettingsNote>}
      {isError && !data && <SettingsNote role="alert">Could not load settings.</SettingsNote>}
      {saveFailed && (
        <SettingsNote role="alert">
          Could not save the change. The previous value is back.
        </SettingsNote>
      )}
    </SettingsColumn>
  );
}
