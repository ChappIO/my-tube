import type { VideoSettings } from '@mytube/shared';
import type { z } from 'zod';

/**
 * The validation messages of `schema` for `value` as one line (a folder structure can have an
 * unknown tag and a `..` at once), or undefined when it parses.
 */
export function schemaError(schema: z.ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  return [...new Set(result.error.issues.map((issue) => issue.message))].join(' ');
}

/** Text box to nullable setting: an empty box means "none" and is stored as null. */
export function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Labels for quality options: `best` reads "best available". */
export function qualityLabel(value: string): string {
  return value === 'best' ? 'best available' : value;
}

/** Labels for Settings → Video → Codec: what each choice is for, not the codec names. */
export function codecLabel(value: VideoSettings['codec']): string {
  return value === 'efficient' ? 'smallest files' : 'plays everywhere';
}

/** The small note under the Format grid: what the chosen codec means for playback. */
export function codecNote(value: VideoSettings['codec']): string {
  return value === 'efficient'
    ? 'AV1 wherever YouTube has it: files about a quarter smaller. Players without an AV1 decoder (every Apple TV, the Nvidia Shield, most TVs and sticks from before 2021) make Plex convert while playing, which buffers.'
    : 'H.264 up to 1080p, VP9 above it, where YouTube has no H.264. Plays as is on Apple TV, older TVs and streaming sticks. Keep this unless disk space matters more.';
}

/** A setting's option list (`as const` array from shared) as `Select` options. */
export function optionsOf<T extends string>(
  values: readonly T[],
  label: (value: T) => string = (value) => value,
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: label(value) }));
}

/** `off` / `on` options for a boolean shown in a key/value row ("Loudness normalization off"). */
export const ON_OFF_OPTIONS = [
  { value: 'off', label: 'off' },
  { value: 'on', label: 'on' },
] as const satisfies readonly { value: 'off' | 'on'; label: string }[];
