import type { CSSProperties } from 'react';
import { glyphGeometry, glyphShapes, tileGeometry } from './geometry';

// Tokens come from styles.css; the fallbacks keep the brand correct before or without them.
const RED = 'var(--color-red, #EA333E)';
const INK = 'var(--color-ink, #151618)';
// The mark's white is fixed; --color-bg turns near-black in dark.
const WHITE = 'var(--color-white, #FFFFFF)';
const FONT = 'var(--font-sans, Archivo, system-ui, sans-serif)';

export type LogoMarkVariant = 'tile' | 'inverted' | 'glyph';

export interface LogoMarkProps {
  /** Rendered width and height in px. Tested at 16, 24, 32, 48, 64 and 96. */
  size?: number;
  /**
   * - `tile`: red tile, white glyph (default).
   * - `inverted`: white tile, red glyph, for red or busy grounds.
   * - `glyph`: glyph alone in `currentColor`, so it can be red or ink.
   */
  variant?: LogoMarkVariant;
  /** Accessible name. Omit when the mark sits next to the wordmark. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/** The MyTube mark: an inverted play glyph resting on a shelf, on a rounded tile. */
export function LogoMark({ size = 28, variant = 'tile', title, className, style }: LogoMarkProps) {
  const isGlyph = variant === 'glyph';
  const g = isGlyph ? glyphGeometry(size) : tileGeometry(size);
  const { triangle, bar } = glyphShapes(size, g);
  const tileFill = variant === 'inverted' ? WHITE : RED;
  const glyphFill = isGlyph ? 'currentColor' : variant === 'inverted' ? RED : WHITE;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {!isGlyph && <rect width={size} height={size} rx={g.radius} fill={tileFill} />}
      <path d={triangle} fill={glyphFill} />
      <rect {...bar} fill={glyphFill} />
    </svg>
  );
}

export interface WordmarkProps {
  /** Font size in px. */
  size?: number;
  /** "My" in ink, "Tube" in red. Otherwise the whole word takes `currentColor`. */
  twoTone?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** "MyTube" set in Archivo 800. Rendered as text so it uses the site font. */
export function Wordmark({ size = 20, twoTone = false, className, style }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{
        font: `800 ${size}px/1 ${FONT}`,
        letterSpacing: size >= 64 ? '-0.035em' : '-0.03em',
        whiteSpace: 'nowrap',
        color: twoTone ? INK : undefined,
        ...style,
      }}
    >
      My
      {twoTone ? <span style={{ color: RED }}>Tube</span> : 'Tube'}
    </span>
  );
}

export interface LogoLockupProps {
  className?: string;
  style?: CSSProperties;
}

/** Header lockup for the sidebar and the narrow top bar: 28px tile, 20px wordmark, 10px gap. */
export function LogoLockup({ className, style }: LogoLockupProps) {
  return (
    <span
      role="img"
      aria-label="MyTube"
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, ...style }}
    >
      <LogoMark size={28} />
      <Wordmark size={20} />
    </span>
  );
}
