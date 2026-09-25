import { useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { closePlayer, playerState } from '../../player-state';

/** The Now Playing route. */
export const NOW_PLAYING_PATH = '/now-playing';

/**
 * Opening and leaving Now Playing (an in-place route). `open` pushes `/now-playing`; `leave`
 * returns to the previous route (browser history, so the library screen comes back as it was),
 * or goes Home when Now Playing was the first page loaded; `close` stops the player and leaves
 * Now Playing when it is open (the bar's ×).
 */
export function useNowPlayingNav(): { open: () => void; leave: () => void; close: () => void } {
  const navigate = useNavigate();
  const router = useRouter();
  const open = useCallback(() => {
    if (playerState().nowOpen) return;
    void navigate({ to: NOW_PLAYING_PATH });
  }, [navigate]);
  const leave = useCallback(() => {
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: '/', replace: true });
  }, [navigate, router]);
  const close = useCallback(() => {
    const wasOpen = playerState().nowOpen;
    closePlayer();
    if (wasOpen) leave();
  }, [leave]);
  return { open, leave, close };
}
