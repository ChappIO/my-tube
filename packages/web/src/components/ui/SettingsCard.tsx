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

/** Settings card (handoff Screen 6): 1px `line` border, radius 14, padding 22px 24px, gap 16. */
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

/** Plain muted status line under the cards: loading, load failure, save failure. */
export function SettingsNote({
  children,
  role,
}: {
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <p role={role} className="text-body text-muted">
      {children}
    </p>
  );
}
