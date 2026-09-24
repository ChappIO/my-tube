import { ChevronDownIcon } from '../icons';
import { cx, focusRing, minHit, valueBox } from './cx';
import { useFieldId } from './KeyValueGrid';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string | number> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Defaults to the id of the surrounding `KeyValueRow`, so its key labels the select. */
  id?: string;
  /** Accessible name when there is no visible label (no `KeyValueRow`). */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A native select drawn as the Settings value box (`surface`, Space Mono 13, radius 8, min
 * 160px, full width on narrow) with a chevron on the right. Values may be strings or numbers;
 * `onChange` gets the option's own value back.
 */
export function Select<T extends string | number>({
  options,
  value,
  onChange,
  id,
  label,
  disabled,
  className,
}: SelectProps<T>) {
  const fieldId = useFieldId(id);
  return (
    <span className={cx('relative block w-full wide:inline-block wide:w-max', className)}>
      <select
        id={fieldId}
        aria-label={label}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((o) => String(o.value) === event.target.value);
          if (option) onChange(option.value);
        }}
        className={cx(
          valueBox,
          'cursor-pointer appearance-none pr-9 disabled:cursor-default disabled:opacity-50',
          minHit,
          focusRing,
        )}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
      />
    </span>
  );
}
