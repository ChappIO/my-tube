import type { AlbumDetail } from '@mytube/shared';
import { useQueryClient } from '@tanstack/react-query';
import { linkOptions } from '@tanstack/react-router';
import { ApiError, apiErrorMessage } from '../../api/client';
import { primeTrack, useAlbum, useDownloadMissing, useUnpinAlbum } from '../../api/library';
import { useCheckSource, useSource } from '../../api/sources';
import { countOf } from '../../format';
import { openTrackPreview } from '../../ui-state';
import { useNow } from '../../use-now';
import { useState } from 'react';
import { Artwork, PinnedChip } from '../media';
import { StatusLine } from '../sources/SourceBits';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { Modal, ModalActions } from '../ui/Modal';
import { cx } from '../ui/cx';
import { Body, DisplayTitle, Meta, SectionLabel, SectionTitle } from '../ui/typography';
import { ArtistCard, SourceCard } from './AlbumCards';
import { ArtistLink } from './ArtistLink';
import { AlbumTrackTable } from './AlbumTrackTable';
import { albumEyebrow, albumMetaLine, albumStatus, downloadAction } from './album-page';

const backToAlbums = linkOptions({ to: '/music/$tab', params: { tab: 'albums' } });

/**
 * The album page (`/music/album/$id`): back link "← Music", the header (large cover, eyebrow,
 * title, artist, meta line, status pill and actions), then the tracks table beside the Artist and
 * Source cards (stacked below it when the page is narrow). `id` is the route param, an album id.
 */
export function AlbumPage({ id }: { id: string }) {
  const albumId = /^\d+$/.test(id) ? Number(id) : 0;
  const album = useAlbum(albumId);

  let body;
  if (albumId === 0 || (album.error instanceof ApiError && album.error.status === 404)) {
    body = <EmptyState>This album is not in your library.</EmptyState>;
  } else if (album.data === undefined) {
    body = loadFailed(album) ? (
      <ErrorState what="this album" {...fromQuery(album)} />
    ) : (
      <StatusLine>Loading album.</StatusLine>
    );
  } else {
    body = <AlbumContent album={album.data} />;
  }

  return (
    <>
      <BackLink link={backToAlbums}>Music</BackLink>
      {body}
    </>
  );
}

function AlbumContent({ album }: { album: AlbumDetail }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const sourceId = album.artist.sourceId;
  const source = useSource(sourceId ?? 0);
  const sourceData = sourceId === null ? null : source.data;
  return (
    <>
      <AlbumHeader album={album} />
      <div className="flex flex-wrap items-start gap-7">
        <div className="min-w-0 flex-[2_1_560px]">
          <AlbumTrackTable
            tracks={album.tracks}
            totalDurationSeconds={album.totalDurationSeconds}
            now={now}
            onOpen={(track) => {
              primeTrack(queryClient, track);
              openTrackPreview(track.id);
            }}
          />
        </div>
        <aside aria-label="About this album" className="grid min-w-0 flex-[1_1_260px] gap-5">
          <ArtistCard artist={album.artist} source={sourceData} />
          <SourceCard youtubeUrl={album.album.youtubeUrl} source={sourceData} />
        </aside>
      </div>
    </>
  );
}

/**
 * The header: the square cover (240px; full width up to 320px below 760px) beside the eyebrow
 * `Album · 2007` (with the `pinned` chip on a pinned album), the display title, the artist (a
 * link to the artist page), the meta line and `AlbumActions`.
 */
export function AlbumHeader({ album }: { album: AlbumDetail }) {
  return (
    <header className="grid items-end gap-5 wide:grid-cols-[240px_minmax(0,1fr)] wide:gap-8">
      <div className="w-full max-w-[320px] wide:max-w-none">
        <Artwork src={album.album.coverUrl ?? undefined} seed={album.album.title} />
      </div>
      <div className="grid min-w-0 gap-[10px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <SectionLabel as="p">{albumEyebrow(album.album.year)}</SectionLabel>
          {album.album.pinned && <PinnedChip />}
        </div>
        <DisplayTitle className="break-words">{album.album.title}</DisplayTitle>
        <SectionTitle as="p">
          <ArtistLink id={album.artist.id}>{album.artist.name}</ArtistLink>
        </SectionTitle>
        <Meta as="p">{albumMetaLine(album)}</Meta>
        <AlbumActions album={album} className="mt-[6px]" />
      </div>
    </header>
  );
}

/**
 * The row of pills under the meta line: the on-disk status, **Download N missing** (primary;
 * `N queued` and disabled while every missing track is queued; absent when complete) and
 * **Check for changes** (outlined; checks the artist's source, disabled without one) and, on a
 * pinned album, **Unpin** (outlined, confirmed first). A status line under the row reports what
 * happened.
 */
export function AlbumActions({ album, className }: { album: AlbumDetail; className?: string }) {
  const download = useDownloadMissing();
  const check = useCheckSource();
  const [unpinning, setUnpinning] = useState(false);
  const action = downloadAction(album);
  const sourceId = album.artist.sourceId;

  let status: string | undefined;
  if (download.isError) status = apiErrorMessage(download.error, 'Could not queue the downloads.');
  else if (check.isError) status = apiErrorMessage(check.error, 'Could not start the check.');
  // Until the queued tracks land: a complete album needs no note.
  else if (download.isSuccess && action)
    status =
      download.data.queued === 0
        ? 'Nothing to queue.'
        : `Queued ${countOf(download.data.queued, 'download')}.`;
  else if (check.isSuccess) status = `Checking ${album.artist.name} for new releases.`;

  return (
    <div className={cx('grid gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <AlbumStatusPill album={album} />
        {action && (
          <Button
            variant="primary"
            disabled={action.disabled || download.isPending}
            onClick={() => {
              check.reset();
              download.mutate(album.album.id);
            }}
          >
            {action.label}
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={sourceId === null || check.isPending}
          title={sourceId === null ? 'The artist is not a source in your library.' : undefined}
          onClick={() => {
            if (sourceId === null) return;
            download.reset();
            check.mutate(sourceId);
          }}
        >
          Check for changes
        </Button>
        {album.album.pinned && (
          <Button variant="outlined" onClick={() => setUnpinning(true)}>
            Unpin
          </Button>
        )}
      </div>
      <StatusLine>{status}</StatusLine>
      {unpinning && <UnpinModal album={album} onClose={() => setUnpinning(false)} />}
    </div>
  );
}

/**
 * Confirms Unpin (`DELETE /api/library/albums/:id/pin`): the album's tracks follow the artist's
 * rules again, and the revalidation queued with it removes the files those rules do not match.
 */
function UnpinModal({ album, onClose }: { album: AlbumDetail; onClose: () => void }) {
  const unpin = useUnpinAlbum();
  return (
    <Modal open onClose={onClose} title={`Unpin ${album.album.title}?`} width="min(460px, 100%)">
      <Body>
        Its tracks follow the rules of {album.artist.name} again. A revalidation starts now and
        removes the files those rules do not match.
      </Body>
      <div className="grid gap-2">
        <StatusLine>
          {unpin.isError ? apiErrorMessage(unpin.error, 'Could not unpin it.') : undefined}
        </StatusLine>
        <ModalActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={unpin.isPending}
            onClick={() => unpin.mutate(album.album.id, { onSuccess: onClose })}
          >
            {unpin.isPending ? 'Unpinning…' : 'Unpin'}
          </Button>
        </ModalActions>
      </div>
    </Modal>
  );
}

const PILL_TONES = { ok: 'text-ok', red: 'text-red' } as const;
const DOT_TONES = { ok: 'bg-ok', red: 'bg-red' } as const;

/** `● 9 of 10 on disk`: Space Mono 700 12 on a `surface` pill; red while incomplete, else green. */
function AlbumStatusPill({ album }: { album: AlbumDetail }) {
  const { text, tone } = albumStatus(album);
  return (
    <span
      className={cx(
        'inline-flex min-h-9 items-center gap-2 rounded-pill bg-surface px-[14px] font-mono text-[12px] font-bold whitespace-nowrap',
        PILL_TONES[tone],
      )}
    >
      <span aria-hidden="true" className={cx('size-2 rounded-full', DOT_TONES[tone])} />
      {text}
    </span>
  );
}
