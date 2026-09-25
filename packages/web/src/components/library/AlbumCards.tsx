import {
  type AlbumDetail,
  type ArtistDetail,
  type Source,
  describeMatcher,
  describeSource,
} from '@mytube/shared';
import type { ReactNode } from 'react';
import { useSetSubscribed } from '../../api/sources';
import { artistMeta, checkedAgo } from '../../format';
import { useNow } from '../../use-now';
import { ExternalLinkIcon } from '../icons';
import { BellToggle } from '../media';
import { SUBSCRIBE_FAILED } from '../sources/ChannelsTab';
import { RuleChips, SourceAvatar, StatusLine } from '../sources/SourceBits';
import { cx, focusRing, hitArea } from '../ui/cx';
import { Body, Meta, SectionLabel, SectionTitle } from '../ui/typography';
import { ArtistLink } from './ArtistLink';
import { checksLabel, sinceLabel } from './artist-page';

/**
 * A card in the side column of the album and artist pages: 1px `line` border, radius 14,
 * padding 22px 24px, gap 16, a Space Mono section label (`Artist`, `Source`, `Subscription`) as
 * its name, and an optional action at the right of the label (Subscription's Edit).
 */
export function SideCard({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `side-card-${label.toLowerCase()}`;
  return (
    <section
      aria-labelledby={id}
      className="grid min-w-0 gap-4 rounded-card border border-line px-6 py-[22px]"
    >
      <div className="flex items-baseline justify-between gap-4">
        <SectionLabel id={id}>{label}</SectionLabel>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A card's text action at the right of its label: Archivo 600 14 in red ("Edit"). */
function CardAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cursor-pointer font-sans text-[14px] font-semibold text-red hover:underline',
        hitArea,
        focusRing,
      )}
    >
      {children}
    </button>
  );
}

export interface ArtistCardProps {
  artist: AlbumDetail['artist'];
  /** The artist's source, once loaded (null when the artist is not a source). */
  source: Source | null | undefined;
}

/**
 * ARTIST: 56px round avatar, the name (a link to the artist page) over `9 albums · 112 tracks`,
 * then the bell as a full-width pill bound to the artist's source (optimistic, like every bell)
 * with a note under it. An artist that is not a source reads "Not in your library as a source."
 * and has no bell.
 */
export function ArtistCard({ artist, source }: ArtistCardProps) {
  const setSubscribed = useSetSubscribed();
  const subscribed = source?.subscribed ?? artist.subscribed;
  return (
    <SideCard label="Artist">
      <div className="flex min-w-0 items-center gap-4">
        <SourceAvatar src={artist.avatarUrl} name={artist.name} size={56} />
        <div className="min-w-0">
          <SectionTitle as="p" className="break-words">
            <ArtistLink id={artist.id}>{artist.name}</ArtistLink>
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
    </SideCard>
  );
}

export interface SourceCardProps {
  /** The album or artist on YouTube Music (opens in a new tab), null without one. */
  youtubeUrl: string | null;
  /** The source, once loaded (null when the artist is not a source). */
  source: Source | null | undefined;
  /**
   * Show the source's rule chips (the album page). The artist page shows them in its
   * Subscription card instead, so they appear once.
   */
  rules?: boolean;
}

/**
 * SOURCE: the album or artist on YouTube Music (a new tab), optionally the source's rule chips,
 * and when the source was last checked. Not rendered when there is neither a link nor a source.
 */
export function SourceCard({ youtubeUrl, source, rules = true }: SourceCardProps) {
  const now = useNow();
  if (youtubeUrl === null && !source) return null;
  const chips = source ? describeSource(source) : [];
  return (
    <SideCard label="Source">
      {youtubeUrl !== null && (
        <a
          href={youtubeUrl}
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
          {rules &&
            (chips.length > 0 ? (
              <RuleChips chips={chips} />
            ) : (
              <Meta as="p">no rules: every release</Meta>
            ))}
          <Meta as="p">{checkedAgo(source.lastCheckedAt, now)}</Meta>
        </div>
      )}
    </SideCard>
  );
}

export interface SubscriptionCardProps {
  artist: ArtistDetail['artist'];
  /** The artist's source, once loaded (null when the artist is not a source). */
  source: Source | null | undefined;
  /** Settings → General's check interval; the row waits while settings load. */
  checkIntervalHours: number | undefined;
  /** Opens the Edit rules modal. */
  onEdit: () => void;
}

/**
 * SUBSCRIPTION (the artist page): the source's rules as chips, how often it is checked and since
 * when it is in the library, with a note on what that means and **Edit** (the Edit rules modal)
 * at the right of the label. An artist that is not a source reads "Not in your library as a
 * source." without the rows.
 */
export function SubscriptionCard({
  artist,
  source,
  checkIntervalHours,
  onEdit,
}: SubscriptionCardProps) {
  if (artist.sourceId === null) {
    return (
      <SideCard label="Subscription">
        <Body muted>Not in your library as a source.</Body>
      </SideCard>
    );
  }
  const matcher = source?.matcher ?? artist.matcher;
  const chips = matcher ? describeMatcher(matcher) : [];
  const subscribed = source?.subscribed ?? artist.subscribed;
  const since = source?.createdAt ?? artist.since;
  return (
    <SideCard label="Subscription" action={<CardAction onClick={onEdit}>Edit</CardAction>}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-[10px] font-sans text-[14px]">
        <SubscriptionRow label="Rules">
          {chips.length > 0 ? (
            // A long chip wraps inside its pill: its lines read left-aligned.
            <RuleChips chips={chips} className="justify-end text-left" />
          ) : (
            'every release'
          )}
        </SubscriptionRow>
        <SubscriptionRow label="Checks">
          {checkIntervalHours === undefined ? '…' : checksLabel(checkIntervalHours)}
        </SubscriptionRow>
        {since && <SubscriptionRow label="Since">{sinceLabel(since)}</SubscriptionRow>}
      </dl>
      <p className="text-tile-meta text-muted">
        {subscribed
          ? 'New releases matching these rules download automatically.'
          : 'Not subscribed: nothing downloads automatically.'}
      </p>
    </SideCard>
  );
}

/** One row of the Subscription card: key Archivo 14 muted, value right-aligned in ink. */
function SubscriptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </>
  );
}
