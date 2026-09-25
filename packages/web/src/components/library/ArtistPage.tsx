import type { ArtistDetail, Source } from '@mytube/shared';
import { linkOptions } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError, apiErrorMessage } from '../../api/client';
import { useArtist, useArtistDownloadMissing } from '../../api/library';
import { useSettings } from '../../api/settings';
import { useCheckSource, useSetSubscribed, useSource } from '../../api/sources';
import { countOf } from '../../format';
import { Artwork, BellToggle } from '../media';
import { SUBSCRIBE_FAILED } from '../sources/ChannelsTab';
import { EditRulesModal } from '../sources/EditRulesModal';
import { StatusLine } from '../sources/SourceBits';
import { BackLink } from '../ui/BackLink';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, fromQuery, loadFailed } from '../ui/ErrorState';
import { cx } from '../ui/cx';
import { DisplayTitle, Meta, SectionLabel } from '../ui/typography';
import { SourceCard, SubscriptionCard } from './AlbumCards';
import { LibraryAlbums, OtherReleases } from './ArtistReleases';
import { artistDownloadAction, artistMetaLine } from './artist-page';

const backToArtists = linkOptions({ to: '/music/$tab', params: { tab: 'artists' } });

/**
 * The artist page (`/music/artist/$id`): back link "← Music", the header (the large round avatar,
 * eyebrow, name, meta line and actions), then "In your library" and "Not in library" beside the
 * Subscription and Source cards (stacked below them when the page is narrow). `id` is the route
 * param, an artist id.
 */
export function ArtistPage({ id }: { id: string }) {
  const artistId = /^\d+$/.test(id) ? Number(id) : 0;
  const artist = useArtist(artistId);

  let body;
  if (artistId === 0 || (artist.error instanceof ApiError && artist.error.status === 404)) {
    body = <EmptyState>This artist is not in your library.</EmptyState>;
  } else if (artist.data === undefined) {
    body = loadFailed(artist) ? (
      <ErrorState what="this artist" {...fromQuery(artist)} />
    ) : (
      <StatusLine>Loading artist.</StatusLine>
    );
  } else {
    body = <ArtistContent detail={artist.data} />;
  }

  return (
    <>
      <BackLink link={backToArtists}>Music</BackLink>
      {body}
    </>
  );
}

function ArtistContent({ detail }: { detail: ArtistDetail }) {
  const sourceId = detail.artist.sourceId;
  const source = useSource(sourceId ?? 0);
  const sourceData = sourceId === null ? null : source.data;
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ArtistHeader detail={detail} source={sourceData} />
      <div className="flex flex-wrap items-start gap-7">
        <div className="grid min-w-0 flex-[2_1_560px] gap-7">
          <LibraryAlbums albums={detail.inLibrary} />
          <OtherReleases releases={detail.notInLibrary} />
        </div>
        <aside aria-label="About this artist" className="grid min-w-0 flex-[1_1_260px] gap-5">
          <SubscriptionCard
            artist={detail.artist}
            source={sourceData}
            checkIntervalHours={settings.data?.general.checkIntervalHours}
            onEdit={() => setEditing(true)}
          />
          <SourceCard youtubeUrl={detail.artist.youtubeUrl} source={sourceData} rules={false} />
        </aside>
      </div>
      {editing && sourceData && (
        <EditRulesModal source={sourceData} onClose={() => setEditing(false)} />
      )}
    </>
  );
}

/**
 * The header: the round avatar (320px; 160px and centred below 760px, with the text) beside the
 * eyebrow `Artist`, the display name, the meta line and `ArtistActions`. No shadow on the
 * avatar: the design allows none there.
 */
export function ArtistHeader({
  detail,
  source,
}: {
  detail: ArtistDetail;
  source: Source | null | undefined;
}) {
  return (
    <header className="grid items-center justify-items-center gap-5 text-center wide:grid-cols-[320px_minmax(0,1fr)] wide:justify-items-stretch wide:gap-10 wide:text-left">
      <div className="w-40 wide:w-full">
        <Artwork
          shape="circle"
          src={detail.artist.avatarUrl ?? undefined}
          seed={detail.artist.name}
        />
      </div>
      <div className="grid min-w-0 gap-[10px]">
        <SectionLabel as="p">Artist</SectionLabel>
        <DisplayTitle className="break-words">{detail.artist.name}</DisplayTitle>
        <Meta as="p">{artistMetaLine(detail)}</Meta>
        <ArtistActions detail={detail} source={source} className="mt-[6px]" />
      </div>
    </header>
  );
}

/**
 * The pills under the meta line: the bell (`Subscribed` / `Subscribe`, bound to the artist's
 * source), **Download N missing tracks** (primary; `N queued` and disabled while every missing
 * track is queued; absent when nothing is missing) and **Check for new releases** (outlined;
 * checks the source, disabled without one). A status line under the row reports what happened.
 * Open folder is not built: a browser cannot open a folder on the server.
 */
export function ArtistActions({
  detail,
  source,
  className,
}: {
  detail: ArtistDetail;
  source: Source | null | undefined;
  className?: string;
}) {
  const setSubscribed = useSetSubscribed();
  const download = useArtistDownloadMissing();
  const check = useCheckSource();
  const { artist } = detail;
  const action = artistDownloadAction(detail);
  const subscribed = source?.subscribed ?? artist.subscribed;

  let status: string | undefined;
  if (download.isError) status = apiErrorMessage(download.error, 'Could not queue the downloads.');
  else if (check.isError) status = apiErrorMessage(check.error, 'Could not start the check.');
  else if (setSubscribed.isError) status = SUBSCRIBE_FAILED;
  else if (download.isSuccess && action)
    status =
      download.data.queued === 0
        ? 'Nothing to queue.'
        : `Queued ${countOf(download.data.queued, 'download')}.`;
  else if (check.isSuccess) status = `Checking ${artist.name} for new releases.`;

  return (
    <div className={cx('grid gap-2', className)}>
      <div className="flex flex-wrap items-center justify-center gap-2 wide:justify-start">
        {artist.sourceId !== null && (
          <BellToggle
            form="pill"
            subscribed={subscribed}
            label={`Subscribe to ${artist.name}`}
            onToggle={(next) => setSubscribed.mutate({ id: artist.sourceId!, subscribed: next })}
          />
        )}
        {action && (
          <Button
            variant="primary"
            disabled={action.disabled || download.isPending}
            onClick={() => {
              check.reset();
              download.mutate(artist.id);
            }}
          >
            {action.label}
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={artist.sourceId === null || check.isPending}
          title={
            artist.sourceId === null ? 'The artist is not a source in your library.' : undefined
          }
          onClick={() => {
            if (artist.sourceId === null) return;
            download.reset();
            check.mutate(artist.sourceId);
          }}
        >
          Check for new releases
        </Button>
      </div>
      <StatusLine>{status}</StatusLine>
    </div>
  );
}
