import { usePlaylists } from '../../api/library';
import { playlistMeta } from '../../format';
import { openEmptyPreview, openTrackPreview } from '../../ui-state';
import { MusicTile } from '../media';
import { MusicGrid } from './MusicGrid';

/** The secondary line of every playlist: MyTube never builds its own playlists. */
export const SYNCED_PLAYLIST = 'Synced from YouTube';

/**
 * Music → Playlists: the playlist stack of the first four covers on disk,
 * "Synced from YouTube" and `42 tracks · 2h51` (`65/68 tracks · 4h12` in red when tracks are
 * missing). A tile opens Preview on the first track on disk ("Nothing on disk yet." without one).
 */
export function PlaylistsTab() {
  return (
    <MusicGrid
      query={usePlaylists()}
      noun="playlists"
      empty="No playlists yet. Add one with + Add to library."
    >
      {(playlist) => {
        const meta = playlistMeta(playlist);
        return (
          <MusicTile
            key={playlist.id}
            kind="playlist"
            title={playlist.name}
            subtitle={SYNCED_PLAYLIST}
            meta={meta.text}
            incomplete={meta.incomplete}
            covers={playlist.covers}
            seed={playlist.name}
            onOpen={() =>
              playlist.firstTrackId === null
                ? openEmptyPreview(playlist.name)
                : openTrackPreview(playlist.firstTrackId)
            }
          />
        );
      }}
    </MusicGrid>
  );
}
