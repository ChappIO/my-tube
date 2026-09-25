import { useAlbums } from '../../api/library';
import { albumMeta } from '../../format';
import { MusicTile } from '../media';
import { MusicGrid } from './MusicGrid';
import { albumPageLink } from './album-page';

/**
 * Music → Albums: an open music tile per album with the artist and
 * `2007 · 10 tracks`, or `12/14 tracks` in red when tracks are missing. A tile is a link to the
 * album page.
 */
export function AlbumsTab() {
  return (
    <MusicGrid
      query={useAlbums()}
      noun="albums"
      empty="No albums yet. Add an artist with + Add to library."
    >
      {(album) => {
        const meta = albumMeta(album);
        return (
          <MusicTile
            key={album.id}
            kind="album"
            title={album.title}
            subtitle={album.artist.name}
            meta={meta.text}
            incomplete={meta.incomplete}
            src={album.coverUrl ?? undefined}
            seed={album.title}
            link={albumPageLink(album.id)}
          />
        );
      }}
    </MusicGrid>
  );
}
