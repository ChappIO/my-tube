import { createFileRoute } from '@tanstack/react-router';
import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { LogoLockup, LogoMark, type LogoMarkVariant, Wordmark } from '../../components/brand/Logo';
import { BellIcon, listIcons } from '../../components/icons';

export const Route = createFileRoute('/dev/logo')({ component: LogoDemo });

// The page follows the theme.
const PAGE_BG = 'var(--color-bg, #FFFFFF)';
const INK = 'var(--color-ink, #151618)';
const MUTED = 'var(--color-muted, #6F747C)';
const LINE = 'var(--color-line, #ECEEF1)';
// The grounds do not: "on white" and "on ink" show the mark on those exact colors in both
// themes. White and red are fixed tokens; the ink ground is the light-theme ink, which has no
// fixed token because --color-ink turns near-white in dark.
const RED = 'var(--color-red, #EA333E)';
const WHITE = 'var(--color-white, #FFFFFF)';
const FIXED_INK = '#151618';
// Dark sample box for the lockup: the dark theme's bg and ink, fixed.
const DARK_BG = '#0F1012';
const DARK_INK = '#F2F3F5';

const SIZES = [16, 24, 32, 48, 64, 96];
const VARIANTS: LogoMarkVariant[] = ['tile', 'inverted', 'glyph'];
const GROUNDS = [
  { name: 'white', bg: WHITE, fg: FIXED_INK },
  { name: 'ink', bg: FIXED_INK, fg: WHITE },
  { name: 'red', bg: RED, fg: WHITE },
];

// Every registry icon plus the non-Lucide bell, so new icons show up here automatically.
const ICONS: (readonly [string, ComponentType<{ size?: number }>])[] = [
  ...listIcons(),
  ['BellIcon', BellIcon],
];

function LogoDemo() {
  return (
    <main
      style={{
        padding: 32,
        display: 'grid',
        gap: 40,
        background: PAGE_BG,
        color: INK,
        font: '400 14px var(--font-sans, Archivo, system-ui, sans-serif)',
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Logo and icons</h1>

      <Section title="Header lockup · 28px tile, 20px wordmark, gap 10px">
        <div data-testid="lockup" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <LogoLockup />
          <div
            style={
              {
                background: DARK_BG,
                color: DARK_INK,
                // The lockup's two-tone wordmark reads --color-ink; pin it to the dark ink here.
                '--color-ink': DARK_INK,
                padding: 16,
                borderRadius: 12,
              } as CSSProperties
            }
          >
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

      <Section title="Favicon · /favicon.svg and /favicon.ico (16px tile, pixel-snapped; ICO adds 32px)">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          <img src="/favicon.svg" width={16} height={16} alt="SVG favicon at 16px" />
          <img src="/favicon.svg" width={64} height={64} alt="SVG favicon at 64px" />
          <img src="/favicon.ico" width={16} height={16} alt="ICO favicon at 16px" />
          <img
            src="/favicon.ico"
            width={64}
            height={64}
            alt="ICO favicon at 64px"
            style={{ imageRendering: 'pixelated' }}
          />
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
