import type { ArtistAlbum, OtherRelease } from '@mytube/shared';
import type { ReactNode } from 'react';
import { apiErrorMessage } from '../../api/client';
import { useDownloadAlbum } from '../../api/library';
import { Artwork, MusicTile, TileGrid } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Meta, SectionTitle } from '../ui/typography';
import { albumPageLink } from './album-page';
import {
  inLibraryCount,
  libraryAlbumMeta,
  missingBadge,
  notInLibraryCount,
  releaseMeta,
} from './artist-page';

/**
 * A section of the artist page: the title (Archivo 700 17) with its count on the right (Space
 * Mono 12 muted), then the content.
 */
function ArtistSection({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) {
  const id = `artist-section-${title.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionTitle id={id}>{title}</SectionTitle>
        <Meta>{count}</Meta>
      </div>
      {children}
    </section>
  );
}

/**
 * "In your library": the artist's albums with a track in the library (or pinned) as album tiles
 * linking to the album page, with `2007 · 10 tracks`, the red `1 missing` badge on incomplete
 * albums and the `pinned` chip on pinned ones.
 */
export function LibraryAlbums({ albums }: { albums: readonly ArtistAlbum[] }) {
  return (
    <ArtistSection title="In your library" count={inLibraryCount(albums.length)}>
      {albums.length === 0 ? (
        <EmptyState>Nothing of this artist is in your library yet.</EmptyState>
      ) : (
        <TileGrid>
          {albums.map((album) => (
            <MusicTile
              key={album.id}
              kind="album"
              title={album.title}
              meta={libraryAlbumMeta(album)}
              badge={missingBadge(album)}
              pinned={album.pinned}
              src={album.coverUrl ?? undefined}
              seed={album.title}
              link={albumPageLink(album.id)}
            />
          ))}
        </TileGrid>
      )}
    </ArtistSection>
  );
}

/**
 * "Not in library": the artist's releases the rules skip, as a bordered list (`ReleaseRow`) with
 * an outlined **Download** each, which pins the release and queues its tracks.
 */
export function OtherReleases({ releases }: { releases: readonly OtherRelease[] }) {
  const download = useDownloadAlbum();
  return (
    <ArtistSection title="Not in library" count={notInLibraryCount(releases.length)}>
      {releases.length === 0 ? (
        <EmptyState>Every release is in your library.</EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-tile border border-line">
          {releases.map((release) => (
            <ReleaseRow
              key={release.id}
              release={release}
              pending={download.isPending && download.variables === release.id}
              onDownload={() => download.mutate(release.id)}
            />
          ))}
        </ul>
      )}
      <StatusLine>
        {download.isError
          ? apiErrorMessage(download.error, 'Could not queue the release.')
          : undefined}
      </StatusLine>
    </ArtistSection>
  );
}

/**
 * One release: grid `56px 1fr auto`, gap 16, 14px 16px, top border between rows: the 56px cover
 * (radius 8), the title (Archivo 600 15) over `1993 · 12 tracks` (Space Mono 12 muted), and the
 * outlined Download.
 */
function ReleaseRow({
  release,
  pending,
  onDownload,
}: {
  release: OtherRelease;
  pending: boolean;
  onDownload: () => void;
}) {
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-t border-line px-4 py-[14px] first:border-t-0">
      <div className="size-14">
        <Artwork src={release.coverUrl ?? undefined} seed={release.title} size="list" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-nav">{release.title}</p>
        <Meta as="p" className="mt-0.5">
          {releaseMeta(release)}
        </Meta>
      </div>
      <Button
        variant="outlined"
        disabled={pending}
        aria-label={`Download ${release.title}`}
        onClick={onDownload}
      >
        {pending ? 'Queuing…' : 'Download'}
      </Button>
    </li>
  );
}
