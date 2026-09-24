import type { z } from 'zod';

/** The first validation message of `schema` for `value`, or undefined when it parses. */
export function schemaError(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

/** Text box to nullable setting: an empty box means "none" and is stored as null. */
export function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** `en, nl` → `['en', 'nl']`: split at commas and whitespace, blanks dropped. */
export function parseLanguageList(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((code) => code.trim())
    .filter((code) => code !== '');
}

/** `['en', 'nl']` → `en, nl`, the handoff's spelling. */
export function formatLanguageList(codes: readonly string[]): string {
  return codes.join(', ');
}

/** Labels for quality options: `best` reads "best available" as in the handoff. */
export function qualityLabel(value: string): string {
  return value === 'best' ? 'best available' : value;
}

/** A setting's option list (`as const` array from shared) as `Select` options. */
export function optionsOf<T extends string>(
  values: readonly T[],
  label: (value: T) => string = (value) => value,
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: label(value) }));
}

/** `off` / `on` options for a boolean shown in a key/value row (handoff: "Loudness … off"). */
export const ON_OFF_OPTIONS = [
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
] as const satisfies readonly { value: 'off' | 'on'; label: string }[];
