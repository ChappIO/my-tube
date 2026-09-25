import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { Body } from '../ui/typography';

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
  if (query.isPending) return <StatusLine>Loading {noun}.</StatusLine>;
  if (query.isError) return <StatusLine>Could not load the {noun}.</StatusLine>;
  if (query.data.length === 0) return <Body muted>{empty}</Body>;
  return <TileGrid>{query.data.map(children)}</TileGrid>;
}
