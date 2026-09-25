import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { type ThemeChoice, useTheme } from '../../theme';

export const Route = createFileRoute('/dev/tokens')({ component: TokensDemo });

const colors = [
  { name: 'bg', light: '#FFFFFF', dark: '#0F1012', use: 'page' },
  { name: 'side', light: '#FAFAFA', dark: '#131417', use: 'sidebar, bottom tab bar' },
  { name: 'surface', light: '#F3F4F6', dark: '#1A1C20', use: 'chips, tile chins, inputs' },
  { name: 'surface2', light: '#E3E6EA', dark: '#26282C', use: 'inactive toggle track' },
  { name: 'line', light: '#ECEEF1', dark: '#23252A', use: 'all 1px borders' },
  { name: 'ink', light: '#151618', dark: '#F2F3F5', use: 'primary text' },
  { name: 'muted', light: '#6F747C', dark: '#8B9098', use: 'secondary text, meta' },
  { name: 'red', light: '#EA333E', dark: '#EA333E', use: 'brand, primary, active' },
  { name: 'ok', light: '#2F9E6A', dark: '#2F9E6A', use: 'on disk, done' },
  { name: 'white', light: '#FFFFFF', dark: '#FFFFFF', use: 'text and glyphs on red' },
  { name: 'scrim', light: 'ink @ 0.45', dark: 'ink @ 0.45', use: 'modal overlay' },
  { name: 'scrim-strong', light: 'ink @ 0.7', dark: 'ink @ 0.7', use: 'preview overlay' },
  { name: 'player', light: '#0F1012', dark: '#0F1012', use: 'preview player area' },
  { name: 'player-glyph', light: 'white @ 0.12', dark: 'white @ 0.12', use: 'preview play circle' },
  { name: 'on-red-track', light: 'white @ 0.3', dark: 'white @ 0.3', use: 'player bar scrubber' },
  { name: 'on-red-hover', light: 'white @ 0.15', dark: 'white @ 0.15', use: 'player bar hover' },
  { name: 'player-card', light: '#151618', dark: '#151618', use: 'floating card' },
  { name: 'player-card-hover', light: '#1F2126', dark: '#1F2126', use: 'card Up next hover' },
  { name: 'player-line', light: 'white @ 0.2', dark: 'white @ 0.2', use: 'card progress track' },
  { name: 'player-dismiss', light: '#151618 @ 0.55', dark: '#151618 @ 0.55', use: 'card ×' },
  { name: 'player-fade', light: '#0F1012 @ 0.9', dark: '#0F1012 @ 0.9', use: 'fade over card art' },
  {
    name: 'player-fade-panel',
    light: '#0F1012 @ 0.85',
    dark: '#0F1012 @ 0.85',
    use: 'fade over Now Playing',
  },
] as const;

const motions = [
  { cls: 'motion-tile', value: 'transform, box-shadow .2s ease', use: 'tile hover' },
  { cls: 'motion-chin', value: 'transform .2s ease', use: 'chin reveal' },
  { cls: 'motion-knob', value: 'left .15s', use: 'toggle knob' },
  { cls: 'motion-spin', value: 'rotate .8s linear, repeating', use: 'player buffering' },
] as const;

const typeRoles = [
  { cls: 'text-h1', spec: 'Archivo 800, 32px / 1.1, −0.03em (26px < 760px)', sample: 'Music' },
  { cls: 'text-modal-title', spec: 'Archivo 800, 22px, −0.02em', sample: 'Add to library' },
  { cls: 'text-section-title', spec: 'Archivo 700, 17px', sample: 'Download rules' },
  { cls: 'text-row-title', spec: 'Archivo 700, 16px', sample: 'Channel name' },
  { cls: 'text-nav', spec: 'Archivo 600, 15px', sample: 'Activity' },
  { cls: 'text-tile-title', spec: 'Archivo 600, 14px / 1.3', sample: 'A video title that wraps' },
  { cls: 'text-body', spec: 'Archivo 400, 14px', sample: 'Nothing downloaded yet.' },
  { cls: 'text-tile-meta', spec: 'Archivo 400, 12px', sample: 'Artist name · 2024' },
  { cls: 'text-section-label', spec: 'Space Mono 700, 12px, upper, 0.08em', sample: 'Recent' },
  { cls: 'text-table-header', spec: 'Space Mono 700, 11px, upper, 0.06em', sample: 'Added' },
  { cls: 'text-meta', spec: 'Space Mono 400, 12px', sample: '/media/music · 12.4 GB' },
  { cls: 'text-meta-sm', spec: 'Space Mono 400, 11px', sample: '2 hours ago' },
  { cls: 'text-nav-badge', spec: 'Space Mono 700, 11px', sample: '3' },
  { cls: 'text-duration', spec: 'Space Mono 700, 10px', sample: '12:34' },
] as const;

const radii = [
  { cls: 'rounded-pill', value: '999px', use: 'buttons, tabs, chips, inputs' },
  { cls: 'rounded-modal', value: '18px', use: 'modals' },
  { cls: 'rounded-card', value: '14px', use: 'settings cards' },
  { cls: 'rounded-tile', value: '12px', use: 'tiles, art, rows' },
  { cls: 'rounded-nav', value: '10px', use: 'nav items' },
  { cls: 'rounded-chip', value: '6px', use: 'chips inside rows' },
  { cls: 'rounded-badge', value: '4px', use: 'duration badge' },
] as const;

const shadows = [
  { cls: 'shadow-tile', value: '0 12px 28px -12px rgba(0,0,0,.35)', use: 'tile hover' },
  { cls: 'shadow-modal', value: '0 40px 80px -30px rgba(0,0,0,.5)', use: 'modals' },
  { cls: 'shadow-preview', value: '0 40px 80px -30px rgba(0,0,0,.6)', use: 'preview modal' },
  { cls: 'shadow-player-bar', value: 'red glow + 0 8px 20px -10px', use: 'player bar' },
  { cls: 'shadow-player-card', value: '0 30px 60px -24px rgba(0,0,0,.55)', use: 'floating card' },
  { cls: 'shadow-player-art', value: '0 8px 18px -8px rgba(0,0,0,.5)', use: 'bar art' },
  {
    cls: 'shadow-player-cover',
    value: '0 12px 24px -12px rgba(0,0,0,.6)',
    use: 'Now Playing cover',
  },
] as const;

const choices: ThemeChoice[] = ['light', 'dark', 'system'];

function TokensDemo() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-24 wide:px-10 wide:pt-8 wide:pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h1">Design tokens</h1>
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

      <Section label="Colors">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 wide:gap-5">
          {colors.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-tile border border-line">
              <div
                className="h-20 border-b border-line"
                style={{ background: `var(--color-${c.name})` }}
              />
              <div className="p-3">
                <div className="text-row-title">{c.name}</div>
                <div className="mt-1 text-meta-sm">
                  <span className={resolvedTheme === 'light' ? 'text-ink' : 'text-muted'}>
                    {c.light}
                  </span>
                  {' / '}
                  <span className={resolvedTheme === 'dark' ? 'text-ink' : 'text-muted'}>
                    {c.dark}
                  </span>
                </div>
                <div className="mt-1 text-tile-meta text-muted">{c.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Type scale">
        <div className="overflow-hidden rounded-tile border border-line">
          {typeRoles.map((t) => (
            <div
              key={t.cls}
              className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 wide:grid-cols-[200px_1fr] wide:items-baseline wide:gap-4"
            >
              <div>
                <div className="text-meta">{t.cls}</div>
                <div className="text-meta-sm text-muted">{t.spec}</div>
              </div>
              <div className={t.cls}>{t.sample}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-badge bg-ink px-1.5 py-0.5 text-duration text-bg">12:34</span>
          <span className="rounded-pill bg-red px-4 py-2 text-[14px] font-semibold text-white">
            Subscribe
          </span>
          <span className="rounded-pill bg-surface px-4 py-2 text-[14px] font-semibold text-ink">
            Cancel
          </span>
          <span className="text-meta text-ok">on disk</span>
          <span className="text-meta text-red">3 missing</span>
        </div>
      </Section>

      <Section label="Radii">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 wide:gap-5">
          {radii.map((r) => (
            <Sample key={r.cls} name={r.cls} value={r.value} use={r.use}>
              <div className={`h-20 border border-line bg-surface2 ${r.cls}`} />
            </Sample>
          ))}
        </div>
      </Section>

      <Section label="Shadows">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-8">
          {shadows.map((s) => (
            <Sample key={s.cls} name={s.cls} value={s.value} use={s.use}>
              <div className={`h-24 rounded-tile bg-surface ${s.cls}`} />
            </Sample>
          ))}
        </div>
      </Section>

      <Section label="Motion and focus">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-8">
          {motions.map((m) => (
            <Sample key={m.cls} name={m.cls} value={m.value} use={m.use}>
              <div className="h-24 overflow-hidden rounded-tile bg-surface">
                <div className={`h-full rounded-tile bg-surface2 hover:translate-x-1/2 ${m.cls}`} />
              </div>
            </Sample>
          ))}
          <Sample
            name="focus-ring"
            value="2px red, offset 2px"
            use="global :focus-visible (Tab here)"
          >
            <button type="button" className="h-24 w-full rounded-tile bg-surface focus-ring">
              Focus me
            </button>
          </Sample>
        </div>
      </Section>

      <Section label="Fonts">
        <p className="font-sans text-[20px] font-[400]">Archivo 400 · The quick brown fox</p>
        <p className="font-sans text-[20px] font-[600]">Archivo 600 · The quick brown fox</p>
        <p className="font-sans text-[20px] font-[800]">Archivo 800 · The quick brown fox</p>
        <p className="mt-2 font-mono text-[16px] font-[400]">Space Mono 400 · 0123456789</p>
        <p className="font-mono text-[16px] font-[700]">Space Mono 700 · 0123456789</p>
      </Section>
    </main>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5 wide:mt-7">
      <h2 className="mb-3 text-section-label text-muted">{label}</h2>
      {children}
    </section>
  );
}

function Sample({
  name,
  value,
  use,
  children,
}: {
  name: string;
  value: string;
  use: string;
  children: ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="mt-3 text-meta">{name}</div>
      <div className="text-meta-sm text-muted">{value}</div>
      <div className="text-tile-meta text-muted">{use}</div>
    </div>
  );
}
