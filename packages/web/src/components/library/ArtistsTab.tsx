import { useArtists } from '../../api/library';
import { artistMeta } from '../../format';
import { MusicTile } from '../media';
import { MusicGrid } from './MusicGrid';
import { artistPageLink } from './artist-page';

/**
 * Music → Artists: a centred circle tile per artist with
 * `9 albums · 112 tracks` and the bell badge when subscribed. A tile is a link to the artist page.
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
          link={artistPageLink(artist.id)}
        />
      )}
    </MusicGrid>
  );
}
