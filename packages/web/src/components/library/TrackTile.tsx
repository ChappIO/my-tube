import type { TrackListItem } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { primeTrack } from '../../api/library';
import { openTrackPreview } from '../../ui-state';
import { Artwork, MediaTile } from '../media';

/**
 * A downloaded track on Home: the square tile shows only the cover; the chin (title and artist)
 * slides up over it on hover or focus. The tile opens Preview on the track.
 */
export function TrackTile({ track }: { track: TrackListItem }) {
  const queryClient = useQueryClient();
  return (
    <MediaTile
      chin="reveal"
      title={track.title}
      art={<Artwork fill src={track.coverUrl ?? undefined} seed={track.title} />}
      subtitle={track.artist.name}
      onOpen={() => {
        primeTrack(queryClient, track);
        openTrackPreview(track.id);
      }}
    />
  );
}
