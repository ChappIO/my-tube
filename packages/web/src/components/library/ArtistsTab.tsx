import { useArtists } from '../../api/library';
import { artistMeta } from '../../format';
import { MusicTile } from '../media';
import { MusicGrid } from './MusicGrid';

/**
 * Music → Artists (handoff Screen 2): a centred circle tile per artist with
 * `9 albums · 112 tracks` and the bell badge when subscribed. Artists have no page of their own
 * in the handoff, so the tiles do not open anything.
 */
export function ArtistsTab() {
  return (
    <MusicGrid
      query={useArtists()}
      noun="artists"
      empty="No artists yet. Add one with + Add to library."
    >
      {(artist) => (
        <MusicTile
          key={artist.id}
          kind="artist"
          title={artist.name}
          meta={artistMeta(artist)}
          subscribed={artist.subscribed}
          src={artist.avatarUrl ?? undefined}
          seed={artist.name}
        />
      )}
    </MusicGrid>
  );
}
