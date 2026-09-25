import { z } from 'zod';

/*
 * Artwork served by the API's cache (`GET /api/artwork/:kind/:id`). The web never loads
 * avatars or thumbnails from Google directly (its image hosts answer bursts with 429): every
 * DTO the screens render points here instead, and the API downloads each image once into
 * `CONFIG_DIR/cache/artwork`. The one exception is `ResolvedSource.avatarUrl` in the Add
 * modal, which describes a source that is not saved yet and so has no row to cache for.
 */

/** Which row an artwork URL belongs to: its avatar (channel, artist) or thumbnail. */
export const ARTWORK_KINDS = ['channel', 'artist', 'video', 'playlist'] as const;
export const ArtworkKind = z.enum(ARTWORK_KINDS);
export type ArtworkKind = z.infer<typeof ArtworkKind>;

const ARTWORK_PATH = /^\/api\/artwork\/(channel|artist|video|playlist)\/[1-9]\d*$/;

/** `/api/artwork/<kind>/<row id>`: a same-origin path to the cached image. */
export const ArtworkPath = z.string().regex(ARTWORK_PATH, 'Expected /api/artwork/<kind>/<id>');
export type ArtworkPath = z.infer<typeof ArtworkPath>;

/** The artwork path of a `channels`, `artists`, `videos` or `playlists` row. */
export function artworkPath(kind: ArtworkKind, id: number): ArtworkPath {
  return `/api/artwork/${kind}/${id}`;
}

/**
 * An image URL in a DTO: the cache path, or an absolute URL for data that has no row yet (and
 * for rows parsed straight from the database, which store the remote URL).
 */
export const ImageUrl = z.union([ArtworkPath, z.url()]);
export type ImageUrl = z.infer<typeof ImageUrl>;
