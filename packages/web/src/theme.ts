import { useCallback, useSyncExternalStore } from 'react';

/** The user's choice. `system` removes the attribute so `prefers-color-scheme` decides. */
export type ThemeChoice = 'light' | 'dark' | 'system';
/** The theme actually on screen. */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key. index.html reads the same key before first paint. */
export const THEME_STORAGE_KEY = 'mytube.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readStoredChoice(): ThemeChoice {
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function writeStoredChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this page load.
  }
}

/** Sets or removes `data-theme` on <html>. */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

let current: ThemeChoice | undefined;
const listeners = new Set<() => void>();

/** The current choice, read from localStorage on first use. */
export function getThemeChoice(): ThemeChoice {
  current ??= readStoredChoice();
  return current;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Applies a choice and caches it in localStorage for the pre-paint script. The settings table
 * (`general.theme`) is the source of truth: screens change the theme through
 * `useUpdateSettings`, which calls this.
 */
export function setTheme(choice: ThemeChoice): void {
  current = choice;
  writeStoredChoice(choice);
  applyThemeChoice(choice);
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== THEME_STORAGE_KEY) return;
  current = parseThemeChoice(event.newValue);
  applyThemeChoice(current);
  notify();
}

function subscribeChoice(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function subscribeSystem(listener: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * The theme seam. `theme` is the stored choice, `resolvedTheme` what is on
 * screen, `setTheme` applies and persists a choice.
 */
export function useTheme(): {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
} {
  const theme = useSyncExternalStore(subscribeChoice, getThemeChoice, () => 'system' as const);
  const system = useSyncExternalStore(subscribeSystem, getSystemTheme, () => 'light' as const);
  const set = useCallback((choice: ThemeChoice) => setTheme(choice), []);
  return { theme, resolvedTheme: theme === 'system' ? system : theme, setTheme: set };
}
