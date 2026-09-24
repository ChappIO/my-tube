import { createFileRoute } from '@tanstack/react-router';
import type { ComponentType, ReactNode } from 'react';
import { LogoLockup, LogoMark, type LogoMarkVariant, Wordmark } from '../../components/brand/Logo';
import {
  ActivityIcon,
  BackIcon,
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  ExternalLinkIcon,
  HomeIcon,
  MoreIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  TrashIcon,
  VideoIcon,
} from '../../components/icons';

export const Route = createFileRoute('/dev/logo')({ component: LogoDemo });

const RED = 'var(--color-red, #EA333E)';
const INK = 'var(--color-ink, #151618)';
const WHITE = 'var(--color-bg, #FFFFFF)';
const MUTED = 'var(--color-muted, #6F747C)';
const LINE = 'var(--color-line, #ECEEF1)';

const SIZES = [16, 24, 32, 48, 64, 96];
const VARIANTS: LogoMarkVariant[] = ['tile', 'inverted', 'glyph'];
const GROUNDS = [
  { name: 'white', bg: WHITE, fg: INK },
  { name: 'ink', bg: INK, fg: WHITE },
  { name: 'red', bg: RED, fg: WHITE },
];

const ICONS: [string, ComponentType<{ size?: number }>][] = [
  ['HomeIcon', HomeIcon],
  ['MusicIcon', MusicIcon],
  ['VideoIcon', VideoIcon],
  ['ActivityIcon', ActivityIcon],
  ['SettingsIcon', SettingsIcon],
  ['PlusIcon', PlusIcon],
  ['CloseIcon', CloseIcon],
  ['SearchIcon', SearchIcon],
  ['PlayIcon', PlayIcon],
  ['PauseIcon', PauseIcon],
  ['TrashIcon', TrashIcon],
  ['CheckIcon', CheckIcon],
  ['ExternalLinkIcon', ExternalLinkIcon],
  ['RefreshIcon', RefreshIcon],
  ['MoreIcon', MoreIcon],
  ['BackIcon', BackIcon],
  ['ChevronLeftIcon', ChevronLeftIcon],
  ['ChevronRightIcon', ChevronRightIcon],
  ['ChevronUpIcon', ChevronUpIcon],
  ['ChevronDownIcon', ChevronDownIcon],
  ['BellIcon', BellIcon],
];

function LogoDemo() {
  return (
    <main
      style={{
        padding: 32,
        display: 'grid',
        gap: 40,
        background: WHITE,
        color: INK,
        font: '400 14px var(--font-sans, Archivo, system-ui, sans-serif)',
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Logo and icons</h1>

      <Section title="Header lockup · 28px tile, 20px wordmark, gap 10px">
        <div data-testid="lockup" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <LogoLockup />
          <div style={{ background: '#0F1012', color: '#F2F3F5', padding: 16, borderRadius: 12 }}>
            <LogoLockup />
          </div>
        </div>
      </Section>

      <Section title="Mark · sizes × variants × grounds">
        <div style={{ display: 'grid', gap: 12 }}>
          {GROUNDS.map((ground) =>
            VARIANTS.map((variant) => (
              <div
                key={`${ground.name}-${variant}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 24,
                  padding: 20,
                  borderRadius: 12,
                  border: `1px solid ${LINE}`,
                  background: ground.bg,
                  color: variant === 'glyph' && ground.name === 'white' ? RED : ground.fg,
                }}
              >
                <Caption color={ground.fg}>
                  {variant} on {ground.name}
                </Caption>
                {SIZES.map((size) => (
                  <div key={size} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                    <LogoMark size={size} variant={variant} />
                    <Caption color={ground.fg}>{size}</Caption>
                  </div>
                ))}
              </div>
            )),
          )}
          <div
            style={{ display: 'flex', alignItems: 'flex-end', gap: 24, padding: 20, color: INK }}
          >
            <Caption>glyph in ink</Caption>
            {SIZES.map((size) => (
              <LogoMark key={size} size={size} variant="glyph" />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Wordmark">
        <div style={{ display: 'grid', gap: 16 }}>
          <Wordmark size={20} />
          <Wordmark size={20} twoTone />
          <Wordmark size={64} />
          <Wordmark size={64} twoTone />
        </div>
      </Section>

      <Section title="Favicon · /favicon.svg (16px tile)">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          <img src="/favicon.svg" width={16} height={16} alt="favicon at 16px" />
          <img src="/favicon.svg" width={64} height={64} alt="favicon at 64px" />
        </div>
      </Section>

      <Section title="Icons · Lucide, 16px default; BellIcon uses the handoff path at 14px">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          {ICONS.map(([name, Icon]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: `1px solid ${LINE}`,
                borderRadius: 10,
              }}
            >
              <Icon />
              <Icon size={20} />
              <Caption>{name}</Caption>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: MUTED,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Caption({ children, color = MUTED }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{ font: `400 11px var(--font-mono, 'Space Mono', monospace)`, color, opacity: 0.8 }}
    >
      {children}
    </span>
  );
}
