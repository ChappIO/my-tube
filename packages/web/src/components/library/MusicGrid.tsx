import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';

export interface MusicGridProps<T> {
  /** The tab's list query. */
  query: UseQueryResult<T[]>;
  /** What the tab lists, for the status lines: `albums` → "Loading albums." */
  noun: string;
  /** The plain line when there is nothing to list. */
  empty: string;
  /** One `MusicTile` per item. */
  children: (item: T) => ReactNode;
}

/**
 * A Music tab's grid of open music tiles (`TileGrid`: `minmax(180px, 1fr)`, gap 20) with its
 * loading, failure and empty lines.
 */
export function MusicGrid<T>({ query, noun, empty, children }: MusicGridProps<T>) {
  // A failed refetch keeps what was loaded; the error shows only when there is nothing.
  if (query.data === undefined) {
    if (loadFailed(query)) return <ErrorState what={`the ${noun}`} {...fromQuery(query)} />;
    return <StatusLine>Loading {noun}.</StatusLine>;
  }
  if (query.data.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <TileGrid>{query.data.map(children)}</TileGrid>;
}
