import { evaluateMatcher, type MatcherContext } from '@mytube/shared';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { playlistItems, playlists, sources, tracks, videos } from '../database/schema.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Whether a source other than `exceptSourceId` wants an item: the source that first listed it
 * (`source_id`) or a playlist source that lists it, whose current tree matches it (a playlist's
 * with the item's position there).
 *
 * One video or track can be listed by several sources: an artist and a playlist of that artist,
 * a channel and one of its playlists. The item keeps one row (and `source_id` points at the
 * first), but every source's rules count: **a match wins**. So a sync or a revalidation of one
 * source never unwants or removes an item another source still wants.
 *
 * `ctx` is the item's matcher context without a playlist position (it is filled per playlist).
 */
export function wantedElsewhere(
  db: Database | Transaction,
  table: 'videos' | 'tracks',
  itemId: number,
  exceptSourceId: number,
  ctx: MatcherContext,
): boolean {
  const items = table === 'videos' ? videos : tracks;
  const itemColumn = table === 'videos' ? playlistItems.videoId : playlistItems.trackId;
  const owner = db
    .select({ sourceId: items.sourceId })
    .from(items)
    .where(eq(items.id, itemId))
    .get()?.sourceId;

  // The playlists that list the item, with the item's first position in each.
  const listed = db
    .select({ sourceId: playlists.sourceId, position: playlistItems.position })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
    .where(
      and(
        eq(itemColumn, itemId),
        isNotNull(playlists.sourceId),
        ne(playlists.sourceId, exceptSourceId),
      ),
    )
    .orderBy(playlistItems.position)
    .all();
  const positions = new Map<number, number>();
  for (const row of listed) {
    if (row.sourceId !== null && !positions.has(row.sourceId)) {
      positions.set(row.sourceId, row.position);
    }
  }

  const candidates = new Set(positions.keys());
  if (owner != null && owner !== exceptSourceId) candidates.add(owner);
  for (const sourceId of candidates) {
    const source = db
      .select({ matcher: sources.matcher, kind: sources.kind })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .get();
    if (!source) continue;
    const playlistPosition = source.kind === 'playlist' ? (positions.get(sourceId) ?? null) : null;
    if (evaluateMatcher(source.matcher, { ...ctx, playlistPosition }).matches) return true;
  }
  return false;
}
