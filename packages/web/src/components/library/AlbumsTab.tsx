import { useAlbums } from '../../api/library';
import { albumMeta } from '../../format';
import { openEmptyPreview, openTrackPreview } from '../../ui-state';
import { MusicTile } from '../media';
import { MusicGrid } from './MusicGrid';

/**
 * Music → Albums (handoff Screen 2): an open music tile per album with the artist and
 * `2007 · 10 tracks`, or `12/14 tracks` in red when tracks are missing. A tile opens Preview on
 * the album's first track on disk ("Nothing on disk yet." without one).
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
            onOpen={() =>
              album.firstTrackId === null
                ? openEmptyPreview(album.title)
                : openTrackPreview(album.firstTrackId)
            }
          />
        );
      }}
    </MusicGrid>
  );
}
