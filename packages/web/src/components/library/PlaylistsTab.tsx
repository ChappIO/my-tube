import type { PlaylistListItem } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { playlistTracksQuery, usePlaylists } from '../../api/library';
import { playlistMeta } from '../../format';
import { MusicTile } from '../media';
import { playlistQueue, startQueue } from '../player/queues';
import { MusicGrid } from './MusicGrid';

/** The secondary line of every playlist: MyTube never builds its own playlists. */
export const SYNCED_PLAYLIST = 'Synced from YouTube';

/**
 * Music → Playlists: the playlist stack of the first four covers on disk,
 * "Synced from YouTube" and `42 tracks · 2h51` (`65/68 tracks · 4h12` in red when tracks are
 * missing). A tile plays the playlist's tracks on disk in playlist order (fetched on click); a
 * playlist with nothing on disk has no action.
 */
export function PlaylistsTab() {
  const queryClient = useQueryClient();
  const play = (playlist: PlaylistListItem) => {
    void queryClient
      .fetchQuery(playlistTracksQuery(playlist.id))
      .then((tracks) => startQueue(playlistQueue(tracks, playlist.name)))
      // A failed read leaves the tile as it was; clicking again retries.
      .catch(() => undefined);
  };
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
            onOpen={playlist.onDiskCount > 0 ? () => play(playlist) : undefined}
          />
        );
      }}
    </MusicGrid>
  );
}
