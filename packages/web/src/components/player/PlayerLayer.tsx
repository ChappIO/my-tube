import { dismissCard, usePlayerState } from '../../player-state';
import { AudioEngine } from './AudioEngine';
import { FloatingCard } from './FloatingCard';
import { PlayerBar } from './PlayerBar';
import { useNowPlayingNav } from './now-playing-nav';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMediaSession } from './useMediaSession';

/**
 * Everything of the player that lives outside the pages, mounted once by `AppShell`: the audio
 * engine, the bar and the card (while something is queued), the global keyboard shortcuts and
 * the Media Session. Now Playing is a route of its own.
 */
export function PlayerLayer() {
  const { player, cardOpen, nowOpen, buffering, error } = usePlayerState();
  const { open, leave, close } = useNowPlayingNav();
  useKeyboardShortcuts(leave);
  useMediaSession();
  return (
    <>
      <AudioEngine />
      {player && (
        <PlayerBar
          player={player}
          buffering={buffering}
          error={error}
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
