import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import {
  Artwork,
  BellToggle,
  CardGrid,
  DurationBadge,
  MediaCard,
  MediaTile,
  MusicTile,
  PlaylistStack,
  TileGrid,
} from '../../components/media';
import { type ThemeChoice, useTheme } from '../../theme';

export const Route = createFileRoute('/dev/media')({ component: MediaDemo });

// Sample data. Art is the seeded placeholder gradient of the title.
const homeGroups = [
  {
    label: 'Today',
    items: [
      { kind: 'video', title: 'Why dishwashers ignore you', sub: 'Technology Connections' },
      { kind: 'album', title: 'Tapestry', sub: 'Carole King · 12 tracks' },
      { kind: 'video', title: 'Monologue, Tuesday', sub: 'Late Show' },
      { kind: 'playlist', title: 'Sunday kitchen', sub: 'Playlist · 3 new tracks' },
    ],
  },
  {
    label: 'Yesterday',
    items: [
      { kind: 'video', title: 'Hand-cut dovetails', sub: 'Woodworking essentials' },
      { kind: 'video', title: 'Ep. 41: the archive problem', sub: 'Deep Dive Podcast' },
      { kind: 'album', title: 'Blue', sub: 'Joni Mitchell · 10 tracks' },
    ],
  },
] as const;

const videos = [
  ['The plan to fix everything, ep. 42', 'Deep Dive Podcast', '2 days ago', '48:12'],
  ['Why dishwashers ignore you', 'Technology Connections', '3 days ago', '31:04'],
  ['Monologue, Tuesday', 'Late Show', '3 days ago', '12:40'],
  ['Hand-cut dovetails', 'Woodworking essentials', '1 week ago', '22:18'],
  ['Ep. 41: the archive problem', 'Deep Dive Podcast', '1 week ago', '52:31'],
  ['The heat pump episode', 'Technology Connections', '2 weeks ago', '44:09'],
] as const;

const albums = [
  ['In Rainbows', 'Radiohead', '2007 · 10 tracks', false],
  ['Blue Train', 'John Coltrane', '1958 · 5 tracks', false],
  ['Tapestry', 'Carole King', '1971 · 12 tracks', false],
  ['Discovery', 'Daft Punk', '2001 · 12/14 tracks', true],
  ['Blue', 'Joni Mitchell', '1971 · 10 tracks', false],
  ['Voodoo', "D'Angelo", '2000 · 13 tracks', false],
  ['Kind of Blue', 'Miles Davis', '1959 · 5 tracks', false],
  ['Aja', 'Steely Dan', '1977 · 6/7 tracks', true],
] as const;

const artists = [
  ['Radiohead', '9 albums · 112 tracks', true],
  ['Carole King', '4 albums · 48 tracks', true],
  ['Joni Mitchell', '6 albums · 61 tracks', true],
  ['Steely Dan', '3 albums · 24 tracks', true],
  ['John Coltrane', '2 albums · 11 tracks', false],
  ['Daft Punk', '1 album · 14 tracks', false],
] as const;

const playlists = [
  ['Late night', 'Yours', '42 tracks · 2h51', false],
  ['Sunday kitchen', 'Synced from YouTube', '65/68 tracks · 4h12', true],
  ['Running', 'Synced from YouTube', '31 tracks · 1h58', false],
] as const;

const channels = ['Deep Dive Podcast', 'Technology Connections', 'Late Show'];

const choices: ThemeChoice[] = ['light', 'dark', 'system'];

function MediaDemo() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [events, setEvents] = useState<string[]>([]);
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({
    'Deep Dive Podcast': true,
    'Technology Connections': false,
    'Late Show': true,
  });

  function log(event: string) {
    // Also on the console so a browser check can read both handlers.
    console.log(`[media demo] ${event}`);
    setEvents((list) => [event, ...list].slice(0, 6));
  }

  function toggle(name: string, next: boolean) {
    log(`onToggle: ${name} → ${next ? 'subscribed' : 'unsubscribed'}`);
    setSubscribed((s) => ({ ...s, [name]: next }));
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-24 wide:px-10 wide:pt-8 wide:pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Media components</h1>
          <p className="mt-2 text-meta text-muted">
            theme={theme} · showing {resolvedTheme}
          </p>
        </div>
        <div role="group" aria-label="Theme" className="flex rounded-pill bg-surface p-1">
          {choices.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={theme === choice}
              onClick={() => setTheme(choice)}
              className={`cursor-pointer rounded-pill px-4 py-2 text-[14px] font-semibold capitalize ${
                theme === choice ? 'bg-bg text-ink' : 'text-muted'
              }`}
            >
              {choice}
            </button>
          ))}
        </div>
      </header>

      <div
        aria-live="polite"
        className="sticky top-0 z-10 mt-4 min-h-[52px] rounded-tile border border-line bg-bg px-3 py-2 text-meta-sm text-muted"
      >
        {events.length === 0 ? 'Events: click a tile, a channel name or a bell.' : null}
        {events.map((e, i) => (
          <div key={i} className={i === 0 ? 'text-ink' : undefined}>
            {e}
          </div>
        ))}
      </div>

      {homeGroups.map((group) => (
        <Section key={group.label} label={`Home · ${group.label}`}>
          <TileGrid>
            {group.items.map((item) =>
              item.kind === 'video' ? (
                <MediaTile
                  key={item.title}
                  chin="fixed"
                  title={item.title}
                  channel={item.sub}
                  art={<Artwork fill seed={item.title} />}
                  onOpen={() => log(`onOpen: ${item.title}`)}
                  onOpenChannel={() => log(`onOpenChannel: ${item.sub}`)}
                />
              ) : (
                <MediaTile
                  key={item.title}
                  chin="reveal"
                  title={item.title}
                  subtitle={item.sub}
                  art={
                    item.kind === 'playlist' ? (
                      <PlaylistStack fill seed={item.title} />
                    ) : (
                      <Artwork fill seed={item.title} />
                    )
                  }
                  onOpen={() => log(`onOpen: ${item.title}`)}
                />
              ),
            )}
          </TileGrid>
        </Section>
      ))}

      <Section label="Videos tab · wide cards with avatar and duration">
        <CardGrid>
          {videos.map(([title, channel, when, duration]) => (
            <MediaCard
              key={title}
              title={title}
              channel={channel}
              channelHref="#"
              when={when}
              duration={duration}
              art={<Artwork fill seed={title} />}
              avatar={<Artwork fill shape="circle" seed={channel} />}
              onOpen={() => log(`onOpen: ${title}`)}
              onOpenChannel={() => log(`onOpenChannel: ${channel}`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section label="Channel page · wide cards without the channel">
        <CardGrid>
          {videos.slice(0, 3).map(([title, , when, duration]) => (
            <MediaCard
              key={title}
              title={title}
              when={when}
              duration={duration}
              art={<Artwork fill seed={title} />}
              onOpen={() => log(`onOpen: ${title}`)}
            />
          ))}
        </CardGrid>
      </Section>

      <Section label="Music · Albums">
        <TileGrid>
          {albums.map(([title, artist, meta, incomplete]) => (
            <MusicTile
              key={title}
              kind="album"
              title={title}
              subtitle={artist}
              meta={meta}
              incomplete={incomplete}
              seed={title}
              onOpen={() => log(`onOpen: ${title}`)}
            />
          ))}
        </TileGrid>
      </Section>

      <Section label="Music · Artists">
        <TileGrid>
          {artists.map(([name, meta, isSubscribed]) => (
            <MusicTile
              key={name}
              kind="artist"
              title={name}
              meta={meta}
              subscribed={isSubscribed}
              seed={name}
              onOpen={() => log(`onOpen: ${name}`)}
            />
          ))}
        </TileGrid>
      </Section>

      <Section label="Music · Playlists">
        <TileGrid>
          {playlists.map(([title, source, meta, incomplete]) => (
            <MusicTile
              key={title}
              kind="playlist"
              title={title}
              subtitle={source}
              meta={meta}
              incomplete={incomplete}
              seed={title}
              onOpen={() => log(`onOpen: ${title}`)}
            />
          ))}
        </TileGrid>
      </Section>

      <Section label="Playlist stack · cover counts">
        <TileGrid>
          <Labeled label="4 placeholder covers (seed)">
            <PlaylistStack seed="Late night" />
          </Labeled>
          <Labeled label="3 covers, repeated to 4">
            <PlaylistStack covers={svgCovers(3)} />
          </Labeled>
          <Labeled label="1 cover, single fallback">
            <PlaylistStack covers={svgCovers(1)} />
          </Labeled>
          <Labeled label="no covers, no seed">
            <PlaylistStack />
          </Labeled>
        </TileGrid>
      </Section>

      <Section label="Bell toggle · circle and pill share state">
        <div className="grid gap-3">
          {channels.map((name) => (
            <div key={name} className="flex flex-wrap items-center gap-3">
              <span className="w-56 text-row-title">{name}</span>
              <BellToggle
                subscribed={subscribed[name] ?? false}
                onToggle={(next) => toggle(name, next)}
                label={`Subscribe to ${name}`}
              />
              <BellToggle
                form="pill"
                subscribed={subscribed[name] ?? false}
                onToggle={(next) => toggle(name, next)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section label="Duration badge">
        <div className="flex flex-wrap gap-5">
          {['0:42', '12:40', '48:12', '1:02:31'].map((d) => (
            <div key={d} className="w-40">
              <Artwork seed={d}>
                <DurationBadge duration={d} />
              </Artwork>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

/** Tiny SVG covers as data URLs, so the image path of the stack can be checked offline. */
function svgCovers(count: number): string[] {
  const colors = ['#2a9d8f', '#e76f51', '#3a86ff', '#ffb703'];
  return Array.from({ length: count }, (_, i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="${colors[i % colors.length]}"/><circle cx="5" cy="5" r="3" fill="#fff" fill-opacity=".5"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5 wide:mt-7">
      <h2 className="mb-3 text-section-label text-muted">{label}</h2>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      {children}
      <div className="mt-2 text-meta-sm text-muted">{label}</div>
    </div>
  );
}
