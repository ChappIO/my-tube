import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { videoSubtitlesQuery } from '../../api/library';
import { currentItem, dismissCard, playerState, usePlayerState } from '../../player-state';
import { cycleCaptions, toggleTheater } from '../../video-prefs';
import { AudioEngine } from './AudioEngine';
import { FloatingCard } from './FloatingCard';
import { PlayerBar } from './PlayerBar';
import { VideoEngine } from './VideoEngine';
import { useNowPlayingNav } from './now-playing-nav';
import { setNowPlayingOpener } from './queues';
import { useInputModality } from './useInputModality';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMediaSession } from './useMediaSession';

/**
 * Everything of the player that lives outside the pages, mounted once by `AppShell`: the audio
 * and video engines, the bar and the card (while something is queued), the global keyboard
 * shortcuts and the Media Session. Now Playing is a route of its own.
 */
export function PlayerLayer() {
  const { player, cardOpen, nowOpen, buffering, error, volume, muted } = usePlayerState();
  const { open, leave, close } = useNowPlayingNav();
  const queryClient = useQueryClient();
  useKeyboardShortcuts(leave, {
    onCaptions: () => {
      const item = currentItem(playerState().player);
      if (item?.kind !== 'video') return;
      const tracks = queryClient.getQueryData(videoSubtitlesQuery(item.id).queryKey) ?? [];
      cycleCaptions(tracks, item.id);
    },
    onTheater: toggleTheater,
  });
  useMediaSession();
  useInputModality();
  // A one-item queue opens Now Playing at once (`startQueue`).
  useEffect(() => {
    setNowPlayingOpener(open);
    return () => setNowPlayingOpener(null);
  }, [open]);
  return (
    <>
      <AudioEngine />
      <VideoEngine />
      {player && (
        <PlayerBar
          player={player}
          buffering={buffering}
          error={error}
          volume={volume}
          muted={muted}
          onOpenNowPlaying={open}
          onClose={close}
        />
      )}
      {player && cardOpen && !nowOpen && (
        <FloatingCard player={player} onOpenNowPlaying={open} onDismiss={dismissCard} />
      )}
    </>
  );
}
