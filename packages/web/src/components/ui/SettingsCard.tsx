import { type ReactNode, useId } from 'react';
import { cx } from './cx';
import { SectionTitle } from './typography';

/** The Settings content column: max width 760px, cards 20px apart. Children are `SettingsCard`s. */
export function SettingsColumn({ children }: { children: ReactNode }) {
  return <div className="grid max-w-[760px] gap-5">{children}</div>;
}

export interface SettingsCardProps {
  /** Card title, Archivo 700 17 (`SectionTitle`). Also the section's accessible name. */
  title: ReactNode;
  /**
   * Card body, 16px apart: a `KeyValueGrid`, `SettingsRow`s, `ToggleRow`s (which bring their
   * own top border) or a button row.
   */
  children: ReactNode;
  className?: string;
}

/** Settings card: 1px `line` border, radius 14, padding 22px 24px, gap 16. */
export function SettingsCard({ title, children, className }: SettingsCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx('grid gap-4 rounded-card border border-line px-6 py-[22px]', className)}
    >
      <SectionTitle id={titleId}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export interface SettingsRowProps {
  /** Left side: Archivo 13 muted ("Follows the device by default."). */
  description: ReactNode;
  /** Right side: the control, for example a small `TabPills`. */
  children: ReactNode;
}

/**
 * A description with a control on the right, as in the Appearance card. Wraps the control under
 * the description when the row gets too narrow.
 */
export function SettingsRow({ description, children }: SettingsRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="font-sans text-[13px] font-normal text-muted">{description}</p>
      {children}
    </div>
  );
}

export interface SettingsNoteProps {
  children: ReactNode;
  role?: 'status' | 'alert';
  /**
   * `body` (default): Archivo 14, for status lines under the cards (loading, load or save
   * failure). `small`: Archivo 12, the footnote ("Paths are container mounts. …"),
   * also used for short notes inside a card.
   */
  size?: 'body' | 'small';
}

/** Plain muted line: a status under the cards, the footnote, or a note inside a card. */
export function SettingsNote({ children, role, size = 'body' }: SettingsNoteProps) {
  return (
    <p
      role={role}
      className={cx(
        size === 'small' ? 'font-sans text-[12px] font-normal' : 'text-body',
        'text-muted',
      )}
    >
      {children}
    </p>
  );
}
