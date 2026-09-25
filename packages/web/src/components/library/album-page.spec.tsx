import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MusicTile } from '../media';
import {
  albumEyebrow,
  albumFileNames,
  albumMetaLine,
  albumPageLink,
  albumStatus,
  downloadAction,
  trackNumberLabel,
} from './album-page';

describe('albumStatus', () => {
  it('is red while tracks are missing', () => {
    expect(albumStatus({ trackCount: 10, onDiskCount: 9 })).toEqual({
      text: '9 of 10 on disk',
      tone: 'red',
    });
  });

  it('is green when every track is on disk', () => {
    expect(albumStatus({ trackCount: 10, onDiskCount: 10 })).toEqual({
      text: '10 of 10 on disk',
      tone: 'ok',
    });
  });
});

describe('albumMetaLine', () => {
  it('reads tracks, length, size and container', () => {
    expect(
      albumMetaLine({
        trackCount: 10,
        totalDurationSeconds: 42 * 60 + 35,
        sizeBytes: 97_000_000,
        container: 'm4a',
      }),
    ).toBe('10 tracks · 42:35 · 97 MB · m4a');
  });

  it('uses hours for long albums and leaves out an unknown size and container', () => {
    expect(
      albumMetaLine({ trackCount: 1, totalDurationSeconds: 3725, sizeBytes: 0, container: null }),
    ).toBe('1 track · 1:02:05');
  });
});

describe('albumEyebrow', () => {
  it('names the year when known', () => {
    expect(albumEyebrow(2007)).toBe('Album · 2007');
    expect(albumEyebrow(null)).toBe('Album');
  });
});

describe('downloadAction', () => {
  it('offers the tracks without a queued download', () => {
    expect(downloadAction({ missingCount: 3, queuedCount: 1 })).toEqual({
      label: 'Download 2 missing',
      disabled: false,
    });
  });

  it('shows the queued count, disabled, once every missing track is queued', () => {
    expect(downloadAction({ missingCount: 2, queuedCount: 2 })).toEqual({
      label: '2 queued',
      disabled: true,
    });
  });

  it('is absent for a complete album', () => {
    expect(downloadAction({ missingCount: 0, queuedCount: 0 })).toBeNull();
  });
});

describe('albumFileNames', () => {
  it('names files relative to the folder the album shares', () => {
    const names = albumFileNames([
      { id: 1, status: 'on_disk', filePath: 'Radiohead/In Rainbows/01 15 Step.m4a' },
      { id: 2, status: 'missing', filePath: 'Radiohead/In Rainbows/03 Nude.m4a' },
      { id: 3, status: 'on_disk', filePath: 'Radiohead/In Rainbows/04 Weird Fishes.m4a' },
      { id: 4, status: 'wanted', filePath: null },
    ]);
    expect([...names]).toEqual([
      [1, '01 15 Step.m4a'],
      [3, '04 Weird Fishes.m4a'],
    ]);
  });

  it('keeps disc folders a template adds', () => {
    const names = albumFileNames([
      { id: 1, status: 'on_disk', filePath: 'A/B/Disc 1/01 x.m4a' },
      { id: 2, status: 'on_disk', filePath: 'A/B/Disc 2/01 y.m4a' },
    ]);
    expect(names.get(1)).toBe('Disc 1/01 x.m4a');
    expect(names.get(2)).toBe('Disc 2/01 y.m4a');
  });
});

describe('trackNumberLabel', () => {
  it('pads the album position, else the row', () => {
    expect(trackNumberLabel(3, 1)).toBe('03');
    expect(trackNumberLabel(null, 12)).toBe('12');
  });
});

describe('album tiles', () => {
  const root = createRootRoute();
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/music/album/$id' }),
    ]),
    history: createMemoryHistory(),
  });

  it('link to the album page instead of playing', () => {
    const html = renderToStaticMarkup(
      <RouterContextProvider router={router}>
        <MusicTile kind="album" title="In Rainbows" link={albumPageLink(7)} />
      </RouterContextProvider>,
    );
    expect(albumPageLink(7)).toMatchObject({ to: '/music/album/$id', params: { id: '7' } });
    expect(html).toMatch(/^<a [^>]*href="\/music\/album\/7"/);
    expect(html).not.toContain('role="button"');
  });

  it('without a link stay a play button', () => {
    const html = renderToStaticMarkup(
      <MusicTile kind="playlist" title="Road Trip" onOpen={() => undefined} />,
    );
    expect(html).toMatch(/^<div role="button"/);
  });
});
