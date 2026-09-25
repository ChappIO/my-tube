import { useEffect } from 'react';
import { currentItem, jumpTo, setNowOpen, usePlayerState } from '../../player-state';
import { BackButton } from '../ui/BackLink';
import { EmptyState } from '../ui/EmptyState';
import { NowPlayingPanel } from './NowPlayingPanel';
import { QueuePanel } from './QueuePanel';
import { useNowPlayingNav } from './now-playing-nav';

/**
 * Now Playing (`/now-playing`), the expanded card: an in-place route in the main column. The bar
 * stays; the card hides while it is open. "← Back to library" (or Esc) returns to the previous
 * route. Music: the panel (blurred cover, visualizer, title overlay) and its caption beside the
 * queue at 1180px and up, the queue below it otherwise.
 */
export function NowPlayingPage() {
  const { player } = usePlayerState();
  const { leave } = useNowPlayingNav();
  const item = currentItem(player);

  useEffect(() => {
    setNowOpen(true);
    return () => setNowOpen(false);
  }, []);

  return (
    <>
      <BackButton onClick={leave}>Back to library</BackButton>
      {player && item ? (
        <div className="grid items-start gap-5 wide:gap-7 min-[1180px]:grid-cols-[minmax(0,1fr)_340px]">
          <NowPlayingPanel item={item} />
          <QueuePanel player={player} onJump={jumpTo} />
        </div>
      ) : (
        <EmptyState>Nothing is playing.</EmptyState>
      )}
    </>
  );
}
