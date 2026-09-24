import { Settings, type SettingsPatch } from '@mytube/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getThemeChoice, setTheme } from '../theme';
import { apiGet, apiPatch } from './client';

export const settingsQueryKey = ['settings'] as const;
const settingsMutationKey = ['settings', 'update'] as const;

/** Returns `settings` with the patch applied, without touching the input. */
export function applySettingsPatch(settings: Settings, patch: SettingsPatch): Settings {
  const next: Record<string, unknown> = { ...settings };
  for (const [group, fields] of Object.entries(patch)) {
    const defined = Object.entries(fields ?? {}).filter(([, value]) => value !== undefined);
    next[group] = Object.assign({}, next[group], Object.fromEntries(defined));
  }
  // Parsing restores the static type and keeps a bad patch out of the cache.
  return Settings.parse(next);
}

/** Every setting (`GET /api/settings`). */
export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: () => apiGet('/api/settings', Settings),
    staleTime: 60_000,
  });
}

/**
 * Saves a partial change (`PATCH /api/settings`). The cache updates optimistically, so controls
 * flip immediately; a failed save rolls the cache (and the theme) back and leaves `isError` set.
 * A theme change is applied to the page right away through `setTheme`.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: settingsMutationKey,
    mutationFn: (patch: SettingsPatch) => apiPatch('/api/settings', patch, Settings),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKey });
      const previous = queryClient.getQueryData<Settings>(settingsQueryKey);
      const previousTheme = getThemeChoice();
      if (previous) {
        queryClient.setQueryData(settingsQueryKey, applySettingsPatch(previous, patch));
      }
      if (patch.general?.theme) setTheme(patch.general.theme);
      return { previous, previousTheme };
    },
    onError: (_error, patch, context) => {
      if (context?.previous) queryClient.setQueryData(settingsQueryKey, context.previous);
      if (patch.general?.theme && context) setTheme(context.previousTheme);
    },
    onSettled: (data) => {
      // With several saves in flight, only the last one settles the cache; an earlier response
      // would otherwise overwrite a newer optimistic value.
      if (queryClient.isMutating({ mutationKey: settingsMutationKey }) > 1) return;
      if (data) queryClient.setQueryData(settingsQueryKey, data);
      else void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
  });
}

/**
 * Applies the stored theme (`general.theme`) once settings load, so a choice made in another
 * browser follows the user. The localStorage copy in `theme.ts` only paints the first frame.
 * Mount once, in the root layout.
 */
export function useThemeFromSettings(): void {
  const { data } = useSettings();
  const theme = data?.general.theme;
  useEffect(() => {
    if (theme && theme !== getThemeChoice()) setTheme(theme);
  }, [theme]);
}
