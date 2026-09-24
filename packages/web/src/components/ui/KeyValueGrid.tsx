import { type ReactNode, createContext, useContext, useId } from 'react';
import { cx, valueBox } from './cx';

/**
 * Settings key/value grid (handoff Screen 6): `180px 1fr`, gap 12px 20px, rows centered. Narrow:
 * one column, each key above its value with an 8px top margin, gap 6px, values full width.
 * Children are `KeyValueRow`s.
 */
export function KeyValueGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'grid grid-cols-1 items-center gap-y-[6px] wide:grid-cols-[180px_1fr] wide:gap-x-5 wide:gap-y-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

const FieldIdContext = createContext<string | undefined>(undefined);

/**
 * The id a form control should use: its own `id` if given, else the one of the surrounding
 * `KeyValueRow`, so the row's key becomes the control's label. `Select` and `NumberInput` call
 * this; call it in any new control meant for a key/value row.
 */
export function useFieldId(id?: string): string | undefined {
  const rowId = useContext(FieldIdContext);
  return id ?? rowId;
}

export interface KeyValueRowProps {
  /** The key: Archivo 14, muted. */
  label: ReactNode;
  /**
   * The value: a control (`Select`, `NumberInput`, `Input shape="value"`), or a `KeyValueText`
   * for read-only values. Controls pick up the row's id through `useFieldId`.
   */
  children: ReactNode;
  /**
   * `true` (default) renders the key as a `<label>` for the control. Pass `false` for a
   * read-only value so the key is plain text.
   */
  control?: boolean;
}

/** One key/value pair of a `KeyValueGrid`: two grid cells, key then value. */
export function KeyValueRow({ label, children, control = true }: KeyValueRowProps) {
  const id = useId();
  const Key = control ? 'label' : 'span';
  return (
    <>
      <Key
        htmlFor={control ? id : undefined}
        className="mt-2 font-sans text-[14px] font-normal text-muted wide:mt-0"
      >
        {label}
      </Key>
      <div className="min-w-0">
        <FieldIdContext.Provider value={control ? id : undefined}>
          {children}
        </FieldIdContext.Provider>
      </div>
    </>
  );
}

/** A read-only value in the value box ("/media/music", "282 GB · 3,104 tracks"). */
export function KeyValueText({ children }: { children: ReactNode }) {
  return <span className={cx(valueBox, 'block')}>{children}</span>;
}
