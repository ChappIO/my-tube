import type { TrackListItem } from '@mytube/shared';
import { Artwork, MediaTile } from '../media';

/**
 * A downloaded track on Home: the square tile shows only the cover; the chin (title and artist)
 * slides up over it on hover or focus. The tile plays (`onPlay`: Home queues its day group).
 */
export function TrackTile({ track, onPlay }: { track: TrackListItem; onPlay: () => void }) {
  return (
    <MediaTile
      chin="reveal"
      title={track.title}
      art={<Artwork fill src={track.coverUrl ?? undefined} seed={track.title} />}
      subtitle={track.artist.name}
      onOpen={onPlay}
    />
  );
}
