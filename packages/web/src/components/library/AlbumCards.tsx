import { type AlbumDetail, type Source, describeSource } from '@mytube/shared';
import type { ReactNode } from 'react';
import { useSetSubscribed } from '../../api/sources';
import { artistMeta, checkedAgo } from '../../format';
import { useNow } from '../../use-now';
import { ExternalLinkIcon } from '../icons';
import { BellToggle } from '../media';
import { SUBSCRIBE_FAILED } from '../sources/ChannelsTab';
import { RuleChips, SourceAvatar, StatusLine } from '../sources/SourceBits';
import { cx, focusRing } from '../ui/cx';
import { Body, Meta, SectionLabel, SectionTitle } from '../ui/typography';

/**
 * A card in the album page's side column: 1px `line` border, radius 14, padding 22px 24px, gap
 * 16, a Space Mono section label (`Artist`, `Source`) as its name.
 */
function AlbumSideCard({ label, children }: { label: string; children: ReactNode }) {
  const id = `album-card-${label.toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      className="grid min-w-0 gap-4 rounded-card border border-line px-6 py-[22px]"
    >
      <SectionLabel id={id}>{label}</SectionLabel>
      {children}
    </section>
  );
}

export interface ArtistCardProps {
  artist: AlbumDetail['artist'];
  /** The artist's source, once loaded (null when the artist is not a source). */
  source: Source | null | undefined;
}

/**
 * ARTIST: 56px round avatar, the name over `9 albums · 112 tracks`, then the bell as a
 * full-width pill bound to the artist's source (optimistic, like every bell) with a note under
 * it. An artist that is not a source reads "Not in your library as a source." and has no bell.
 */
export function ArtistCard({ artist, source }: ArtistCardProps) {
  const setSubscribed = useSetSubscribed();
  const subscribed = source?.subscribed ?? artist.subscribed;
  return (
    <AlbumSideCard label="Artist">
      <div className="flex min-w-0 items-center gap-4">
        <SourceAvatar src={artist.avatarUrl} name={artist.name} size={56} />
        <div className="min-w-0">
          <SectionTitle as="p" className="break-words">
            {artist.name}
          </SectionTitle>
          <Body muted as="p" className="mt-0.5">
            {artistMeta(artist)}
          </Body>
        </div>
      </div>
      {artist.sourceId === null ? (
        <Body muted>Not in your library as a source.</Body>
      ) : (
        <div className="grid gap-[10px]">
          <BellToggle
            form="pill"
            fullWidth
            subscribed={subscribed}
            label={`Subscribe to ${artist.name}`}
            onToggle={(next) => setSubscribed.mutate({ id: artist.sourceId!, subscribed: next })}
          />
          <p className="text-center text-tile-meta text-muted">
            {subscribed
              ? 'New releases download automatically.'
              : 'New releases are not downloaded.'}
          </p>
          {setSubscribed.isError && <StatusLine>{SUBSCRIBE_FAILED}</StatusLine>}
        </div>
      )}
    </AlbumSideCard>
  );
}

export interface SourceCardProps {
  album: AlbumDetail['album'];
  /** The artist's source, once loaded (null when the artist is not a source). */
  source: Source | null | undefined;
}

/**
 * SOURCE: the album on YouTube Music (a new tab), the artist source's rule chips and when it was
 * last checked. Not rendered when there is neither a link nor a source.
 */
export function SourceCard({ album, source }: SourceCardProps) {
  const now = useNow();
  if (album.youtubeUrl === null && !source) return null;
  const chips = source ? describeSource(source) : [];
  return (
    <AlbumSideCard label="Source">
      {album.youtubeUrl !== null && (
        <a
          href={album.youtubeUrl}
          target="_blank"
          rel="noreferrer"
          className={cx(
            'inline-flex items-center gap-2 self-start font-sans text-[14px] font-semibold text-ink hover:text-red',
            focusRing,
          )}
        >
          <ExternalLinkIcon />
          YouTube Music
        </a>
      )}
      {source && (
        <div className="grid gap-[10px]">
          {chips.length > 0 ? (
            <RuleChips chips={chips} />
          ) : (
            <Meta as="p">no rules: every release</Meta>
          )}
          <Meta as="p">{checkedAgo(source.lastCheckedAt, now)}</Meta>
        </div>
      )}
    </AlbumSideCard>
  );
}
