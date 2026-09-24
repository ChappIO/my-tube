import { createFileRoute, linkOptions } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from '../../components/icons';
import { BackLink } from '../../components/ui/BackLink';
import { MUSIC_TABS, TAB_LABELS } from '../../navigation';
import { Button } from '../../components/ui/Button';
import { CheckboxRow } from '../../components/ui/CheckboxRow';
import { IconButton } from '../../components/ui/IconButton';
import { Input } from '../../components/ui/Input';
import { Modal, ModalActions } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard, StatCardGroup } from '../../components/ui/StatCard';
import { TabPillLinks, TabPills } from '../../components/ui/TabPills';
import { Toggle, ToggleRow } from '../../components/ui/Toggle';
import {
  Body,
  FieldLabel,
  Meta,
  ModalTitle,
  PageTitle,
  SectionLabel,
  SectionTitle,
  TableHeaderLabel,
} from '../../components/ui/typography';
import { type ThemeChoice, useTheme } from '../../theme';

export const Route = createFileRoute('/dev/components')({ component: ComponentsDemo });

const themeItems = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
] as const satisfies readonly { id: ThemeChoice; label: string }[];

const musicTabs = [
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'tracks', label: 'Tracks' },
] as const;
type MusicTab = (typeof musicTabs)[number]['id'];

const musicTabLinks = MUSIC_TABS.map((tab) => ({
  id: tab,
  label: TAB_LABELS[tab],
  link: linkOptions({ to: '/music/$tab', params: { tab } }),
}));

const backToVideo = linkOptions({ to: '/video/$tab', params: { tab: 'channels' } });

const trackFilters = [
  { id: 'all', label: 'All' },
  { id: 'missing', label: 'Missing' },
  { id: 'recent', label: 'Recent' },
] as const;
type TrackFilter = (typeof trackFilters)[number]['id'];

const libraries = [
  { id: 'video', label: 'Video' },
  { id: 'music', label: 'Music' },
] as const;
type Library = (typeof libraries)[number]['id'];

const rulesByLibrary: Record<Library, { id: string; label: string; hint: string }[]> = {
  video: [
    { id: 'shorts', label: 'Skip shorts', hint: 'under 60 s' },
    { id: 'keep', label: 'Keep only the last 90 days', hint: 'older files deleted' },
    { id: 'titles', label: 'Only titles matching', hint: '"Deep Dive"' },
  ],
  music: [
    { id: 'live', label: 'Skip live recordings', hint: 'title contains "live"' },
    { id: 'albums', label: 'Download full albums', hint: 'not singles' },
    { id: 'cover', label: 'Embed cover art', hint: 'from YouTube Music' },
  ],
};

function ComponentsDemo() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [musicTab, setMusicTab] = useState<MusicTab>('albums');
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [query, setQuery] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [skipLive, setSkipLive] = useState(false);
  const [bare, setBare] = useState(true);
  const [rules, setRules] = useState<Record<string, boolean>>({ shorts: true, keep: true });
  const [addOpen, setAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [library, setLibrary] = useState<Library>('video');
  const [url, setUrl] = useState('');

  const setRule = (id: string, on: boolean) => setRules((r) => ({ ...r, [id]: on }));

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-24 wide:px-10 wide:pt-8 wide:pb-16">
      <PageHeader
        title="Components"
        sub={`theme=${theme} · showing ${resolvedTheme}`}
        actions={<TabPills label="Theme" items={themeItems} value={theme} onChange={setTheme} />}
      />

      <Story name="PageHeader" note="title, sub, actions (stat cards or tab pills); wraps">
        <div className="grid gap-8">
          <PageHeader
            title="What's new"
            sub="Across music and video, newest first."
            actions={
              <StatCardGroup>
                <StatCard label="queue" value="3 downloading" />
                <StatCard label="downloaded, all time" value="4,812 files" />
                <StatCard label="library" value="412 GB" />
              </StatCardGroup>
            }
          />
          <PageHeader
            title="Music"
            sub="31 artists · 84 albums · 3 playlists · 4 artist subscriptions"
            actions={
              <TabPills
                label="Music view"
                items={musicTabs}
                value={musicTab}
                onChange={setMusicTab}
              />
            }
          />
        </div>
      </Story>

      <Story name="TabPills" note="md 8px 16px Archivo 600 14 · sm 7px 14px Archivo 600 13">
        <div className="flex flex-wrap items-center gap-4">
          <TabPills label="Music view" items={musicTabs} value={musicTab} onChange={setMusicTab} />
          <TabPills
            label="Track filter"
            size="sm"
            items={trackFilters}
            value={trackFilter}
            onChange={setTrackFilter}
          />
        </div>
        <Meta as="p" className="mt-3">
          musicTab={musicTab} · trackFilter={trackFilter}
        </Meta>
      </Story>

      <Story
        name="TabPillLinks"
        note="routed variant, same styles · links leave this page · aria-current on the active pill"
      >
        <TabPillLinks label="Music view" items={musicTabLinks} value="albums" />
      </Story>

      <Story name="BackLink" note="Archivo 600 13 muted, hover ink">
        <BackLink link={backToVideo}>Video</BackLink>
      </Story>

      <Story name="Button" note="primary, secondary, outlined × md, lg · optional leading icon">
        <div className="grid gap-4">
          <Row>
            <Button variant="primary">Subscribe</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="outlined">Edit rules</Button>
            <Button variant="outlined" icon={<RefreshIcon />}>
              Check now
            </Button>
            <Button variant="outlined" disabled>
              Disabled
            </Button>
          </Row>
          <Row>
            <Button variant="primary" size="lg">
              Subscribe
            </Button>
            <Button variant="secondary" size="lg">
              Cancel
            </Button>
            <Button variant="outlined" size="lg" icon={<TrashIcon />}>
              Delete file
            </Button>
          </Row>
          <div className="max-w-[232px]">
            <Button variant="primary" size="lg" fullWidth icon={<PlusIcon />}>
              Add to library
            </Button>
          </div>
        </div>
      </Story>

      <Story name="IconButton" note="32, 36, 40px circles · surface or red · 44px hit area narrow">
        <Row>
          <IconButton label="Add to library (small)" size="sm">
            <PlusIcon />
          </IconButton>
          <IconButton label="Search">
            <SearchIcon />
          </IconButton>
          <IconButton label="Add to library" size="lg" tone="red">
            <PlusIcon size={20} />
          </IconButton>
        </Row>
      </Story>

      <Story name="Input" note="pill (search, filter) or field (radius 10) · mono for URLs, paths">
        <div className="grid gap-4">
          <Row>
            <Input
              shape="pill"
              width={300}
              placeholder="Filter by title, artist or album"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Meta>{query ? `filter="${query}"` : '17 of 17 tracks'}</Meta>
          </Row>
          <div className="grid max-w-[504px] gap-2">
            <FieldLabel htmlFor="demo-path">Cookies file</FieldLabel>
            <Input id="demo-path" mono defaultValue="/config/cookies.txt" />
          </div>
        </div>
      </Story>

      <Story name="Toggle, ToggleRow" note="44×26 switch, knob left 3px → 21px, left .15s">
        <div className="grid max-w-[760px] gap-4 rounded-card border border-line px-6 py-[22px]">
          <SectionTitle as="h3">Behaviour</SectionTitle>
          <ToggleRow
            label="Update automatically"
            description="Checks every 6 hours. Downloads fail fast when yt-dlp is stale, so keep this on."
            checked={autoUpdate}
            onChange={setAutoUpdate}
          />
          <ToggleRow label="Skip live recordings" checked={skipLive} onChange={setSkipLive} />
          <ToggleRow
            label="Save thumbnails"
            description="As a sidecar file, for Plex."
            checked
            onChange={() => {}}
            disabled
          />
        </div>
        <Row className="mt-4">
          <Toggle label="Bare switch" checked={bare} onChange={setBare} />
          <Meta>bare={String(bare)}</Meta>
        </Row>
      </Story>

      <Story name="CheckboxRow" note="11px 12px, radius 10 · checked row surface · 20px box">
        <div className="grid max-w-[504px] gap-2">
          {rulesByLibrary.video.map((rule) => (
            <CheckboxRow
              key={rule.id}
              label={rule.label}
              hint={rule.hint}
              checked={rules[rule.id] ?? false}
              onChange={(on) => setRule(rule.id, on)}
            />
          ))}
        </div>
      </Story>

      <Story name="StatCard" note="label Space Mono 11 muted over value Archivo 700 16">
        <StatCardGroup>
          <StatCard label="queue" value="3 downloading" />
          <StatCard label="library" value="412 GB" />
        </StatCardGroup>
      </Story>

      <Story name="Typography" note="type role components">
        <div className="grid gap-3">
          <PageTitle as="div">PageTitle</PageTitle>
          <ModalTitle as="div">ModalTitle</ModalTitle>
          <SectionTitle as="div">SectionTitle</SectionTitle>
          <SectionLabel as="div">SectionLabel</SectionLabel>
          <TableHeaderLabel>TableHeaderLabel</TableHeaderLabel>
          <Body>Body. Nothing downloaded yet.</Body>
          <Body muted>Body muted. Across music and video, newest first.</Body>
          <Row>
            <Meta>Meta · /media/music</Meta>
            <Meta size="sm">Meta sm · 2 hours ago</Meta>
            <Meta tone="ok">on disk</Meta>
            <Meta tone="red">missing</Meta>
          </Row>
          <FieldLabel>FieldLabel</FieldLabel>
        </div>
      </Story>

      <Story name="Modal" note="overlay 0.45 (strong 0.7) · click outside, Escape or × closes">
        <Row>
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setAddOpen(true)}>
            Add to library
          </Button>
          <Button variant="outlined" onClick={() => setPreviewOpen(true)}>
            Open wide, strong dim
          </Button>
        </Row>
      </Story>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add to library">
        <div className="grid gap-2">
          <FieldLabel htmlFor="demo-url">Paste a YouTube link</FieldLabel>
          <Input
            id="demo-url"
            mono
            placeholder="https://www.youtube.com/@channel or /playlist?list=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="grid justify-items-start gap-2">
          <FieldLabel as="div">Save to</FieldLabel>
          <TabPills label="Save to" items={libraries} value={library} onChange={setLibrary} />
        </div>
        <div className="grid gap-2">
          <FieldLabel as="div">Rules</FieldLabel>
          {rulesByLibrary[library].map((rule) => (
            <CheckboxRow
              key={rule.id}
              label={rule.label}
              hint={rule.hint}
              checked={rules[rule.id] ?? false}
              onChange={(on) => setRule(rule.id, on)}
            />
          ))}
        </div>
        <ModalActions>
          <Button size="lg" onClick={() => setAddOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={() => setAddOpen(false)}>
            Subscribe
          </Button>
        </ModalActions>
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="A wider dialog"
        dim="strong"
        width="min(880px, 100%)"
      >
        <Body muted>Uses the Preview overlay (0.7) and a wider dialog.</Body>
      </Modal>
    </main>
  );
}

function Story({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-5 wide:mt-7 wide:pt-7">
      <SectionLabel>{name}</SectionLabel>
      <Meta as="p" size="sm" className="mt-1 mb-4">
        {note}
      </Meta>
      {children}
    </section>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-3 ${className ?? ''}`}>{children}</div>;
}
