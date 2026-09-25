import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MusicTile } from '../media';
import { OtherReleases } from './ArtistReleases';
import {
  artistDownloadAction,
  artistMetaLine,
  artistPageLink,
  checksLabel,
  libraryAlbumMeta,
  missingBadge,
  notInLibraryCount,
  releaseMeta,
  sinceLabel,
} from './artist-page';

describe('artistMetaLine', () => {
  it('reads albums, tracks on disk and the missing ones', () => {
    expect(artistMetaLine({ albumCount: 9, onDiskTracks: 112, missingTracks: 1 })).toBe(
      '9 albums · 112 tracks on disk · 1 missing',
    );
  });

  it('leaves out the missing part when nothing is missing', () => {
    expect(artistMetaLine({ albumCount: 1, onDiskTracks: 1, missingTracks: 0 })).toBe(
      '1 album · 1 track on disk',
    );
  });
});

describe('artistDownloadAction', () => {
  it('offers the tracks without a queued download', () => {
    expect(artistDownloadAction({ missingTracks: 3, queuedTracks: 2 })).toEqual({
      label: 'Download 1 missing track',
      disabled: false,
    });
    expect(artistDownloadAction({ missingTracks: 4, queuedTracks: 0 })?.label).toBe(
      'Download 4 missing tracks',
    );
  });

  it('shows the queued count, disabled, once every missing track is queued', () => {
    expect(artistDownloadAction({ missingTracks: 2, queuedTracks: 2 })).toEqual({
      label: '2 queued',
      disabled: true,
    });
  });

  it('is absent when everything is on disk', () => {
    expect(artistDownloadAction({ missingTracks: 0, queuedTracks: 0 })).toBeNull();
  });
});

describe('release and album texts', () => {
  it('reads year and tracks, the tracks alone without a year', () => {
    expect(releaseMeta({ year: 1993, trackCount: 12 })).toBe('1993 · 12 tracks');
    expect(releaseMeta({ year: null, trackCount: 1 })).toBe('1 track');
    expect(libraryAlbumMeta({ year: 2007, trackCount: 10 })).toBe('2007 · 10 tracks');
  });

  it('badges an incomplete album only', () => {
    expect(missingBadge({ missingCount: 1 })).toBe('1 missing');
    expect(missingBadge({ missingCount: 0 })).toBeUndefined();
  });

  it('counts the releases and names the source', () => {
    expect(notInLibraryCount(7)).toBe('7 releases · from YouTube Music');
  });

  it('formats the subscription rows', () => {
    expect(checksLabel(6)).toBe('every 6 h');
    expect(sinceLabel('2026-06-12T10:00:00.000Z')).toBe('June 2026');
  });
});

describe('artist page markup', () => {
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/music/artist/$id' }),
      createRoute({ getParentRoute: () => root, path: '/music/album/$id' }),
    ]),
    history: createMemoryHistory(),
  });
  const render = (node: ReactNode) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RouterContextProvider router={router}>{node}</RouterContextProvider>
      </QueryClientProvider>,
    );

  it('makes an artist tile a link to the artist page', () => {
    const html = render(
      <MusicTile kind="artist" title="Radiohead" subscribed link={artistPageLink(4)} />,
    );
    expect(artistPageLink(4)).toMatchObject({ to: '/music/artist/$id', params: { id: '4' } });
    expect(html).toMatch(/^<a [^>]*href="\/music\/artist\/4"/);
    expect(html).toContain('aria-label="Subscribed"');
  });

  it('puts the red missing badge and the pinned chip on an album tile', () => {
    const html = render(
      <MusicTile
        kind="album"
        title="In Rainbows"
        badge="1 missing"
        pinned
        meta="2007 · 10 tracks"
      />,
    );
    expect(html).toMatch(/<span class="[^"]*bg-red[^"]*">1 missing<\/span>/);
    expect(html).toMatch(/>pinned<\/span>/);
  });

  it('lists a release that is not in the library with its meta and a Download button', () => {
    const html = render(
      <OtherReleases
        releases={[
          {
            id: 3,
            title: 'Pablo Honey',
            year: 1993,
            coverUrl: '/api/artwork/album/3',
            trackCount: 12,
            youtubeUrl: 'https://music.youtube.com/playlist?list=OLAK5uy_x',
          },
        ]}
      />,
    );
    expect(html).toContain('Not in library');
    expect(html).toContain('1 release · from YouTube Music');
    expect(html).toContain('Pablo Honey');
    expect(html).toContain('1993 · 12 tracks');
    expect(html).toMatch(/<button[^>]*aria-label="Download Pablo Honey"[^>]*>Download<\/button>/);
  });
});
