/*
 * Folder structure templates (Settings → Music / Video → Library → Folder structure).
 *
 * A template is a path relative to the library mount. `/` separates folders; `{tag}` is
 * replaced by a value of the item. The tags below are the only ones that exist: the download
 * job fills exactly these and the settings schema rejects anything else.
 *
 * Modifier: `:02` is the only one. It zero-pads a numeric tag to 2 digits (`{track:02}` → `07`)
 * and is rejected on text tags.
 */

export interface PathTag {
  /** The name between the braces, without them. */
  tag: string;
  /** One line for the Settings chip and the docs. */
  description: string;
  /** Numeric tags accept the `:02` modifier. */
  numeric?: boolean;
}

/** The only modifier: zero-pad a numeric tag to 2 digits. */
export const PATH_TAG_PAD_MODIFIER = '02';

/** Tags of `music.pathTemplate`. */
export const MUSIC_PATH_TAGS = [
  { tag: 'artist', description: 'Album artist, else the track artist.' },
  { tag: 'album', description: 'Album title.' },
  { tag: 'title', description: 'Track title.' },
  {
    tag: 'track',
    description: 'Track number on the album; {track:02} pads it to 2 digits.',
    numeric: true,
  },
  { tag: 'disc', description: 'Disc number, 1 for single-disc albums.', numeric: true },
  { tag: 'year', description: 'Release year.', numeric: true },
  { tag: 'id', description: 'YouTube video id of the track.' },
] as const satisfies readonly PathTag[];

/** Tags of `video.pathTemplate`. */
export const VIDEO_PATH_TAGS = [
  { tag: 'channel', description: 'Channel name.' },
  { tag: 'title', description: 'Video title.' },
  { tag: 'date', description: 'Upload date, YYYY-MM-DD.' },
  { tag: 'year', description: 'Upload year.', numeric: true },
  { tag: 'id', description: 'YouTube video id.' },
  { tag: 'playlist', description: 'Playlist name; empty when not downloaded from a playlist.' },
] as const satisfies readonly PathTag[];

export interface PathTemplateCheck {
  /** Tags that do not exist or use an unknown modifier, as written (`{bogus}`, `{track:3}`). */
  unknownTags: string[];
  /** Every problem as a sentence for the user, the unknown tags included. Empty when valid. */
  errors: string[];
}

const TOKEN = /\{([^{}]*)\}/g;
const TAG_WITH_MODIFIER = /^([a-z]+)(?::(\d+))?$/;

/**
 * Checks a template against a tag list. Pure; used by the settings schema (so the API rejects
 * bad templates with this message) and by the web for the inline error.
 *
 * Rejected: unknown tags or modifiers, `:02` on a text tag, unmatched braces, `..` folders and
 * absolute paths (`/…`, `\…`, `C:…`); the template is always relative to the library mount.
 */
export function validatePathTemplate(
  template: string,
  tags: readonly PathTag[],
): PathTemplateCheck {
  const byName = new Map(tags.map((tag) => [tag.tag, tag]));
  const unknownTags: string[] = [];
  const paddedText: string[] = [];

  for (const match of template.matchAll(TOKEN)) {
    const written = match[0];
    const parsed = TAG_WITH_MODIFIER.exec(match[1] ?? '');
    const tag = parsed?.[1] ? byName.get(parsed[1]) : undefined;
    const modifier = parsed?.[2];
    if (!tag || (modifier !== undefined && modifier !== PATH_TAG_PAD_MODIFIER)) {
      if (!unknownTags.includes(written)) unknownTags.push(written);
    } else if (modifier !== undefined && !tag.numeric && !paddedText.includes(written)) {
      paddedText.push(written);
    }
  }

  const errors: string[] = [];
  if (unknownTags.length > 0) {
    errors.push(
      // The supported tags are listed next to the field, so the message names only the bad ones.
      `Unknown ${unknownTags.length === 1 ? 'tag' : 'tags'} ${unknownTags.join(', ')}.`,
    );
  }
  if (paddedText.length > 0) {
    errors.push(`:02 only pads numbers, not ${paddedText.join(', ')}.`);
  }
  if (/[{}]/.test(template.replace(TOKEN, ''))) {
    errors.push('Unmatched { or }.');
  }
  if (/^[/\\]|^[A-Za-z]:/.test(template)) {
    errors.push('Use a path relative to the library folder, without a leading /.');
  }
  if (template.split(/[/\\]/).some((segment) => segment.trim() === '..')) {
    errors.push('Folders named .. are not allowed.');
  }
  return { unknownTags, errors };
}

/** Values for `renderPathTemplate`, by tag name. Missing, null and empty values render as ''. */
export type PathTemplateValues = Readonly<Record<string, string | number | null | undefined>>;

/** Longest folder or file name `renderPathTemplate` produces, in UTF-8 bytes. */
export const PATH_SEGMENT_MAX_BYTES = 200;

/** Returned when every segment of a rendered template is empty. */
export const EMPTY_PATH_FALLBACK = 'untitled';

// Characters that are invalid in file names on some filesystem (Windows, SMB shares, exFAT)
// plus control characters. `/` and `\` would split the name.
// oxlint-disable-next-line no-control-regex -- control characters are exactly what is removed
const UNSAFE_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * Fills a folder structure template (already validated against its tag list) and returns a
 * relative path with `/` separators. Pure; for the download job and the library read models.
 *
 * - Each `{tag}` is replaced by its value; `{tag:02}` zero-pads a number to 2 digits. Unknown
 *   tags and missing values render as nothing.
 * - Every folder and file name is sanitised on its own, after substitution: characters that
 *   are invalid on common filesystems (`/ \ : * ? " < > |` and control characters) are
 *   removed, whitespace runs become one space, leading and trailing dots and spaces are trimmed
 *   (so `.` and `..` become empty), and the name is cut to `PATH_SEGMENT_MAX_BYTES` UTF-8 bytes
 *   without splitting a character. A value can therefore never add a folder or climb out of
 *   the library: a title of `../../etc` becomes the name `etc`.
 * - Empty names are dropped (`{playlist}` outside a playlist); an entirely empty result is
 *   `untitled`.
 *
 * The file extension is not part of the template; the caller appends it.
 */
export function renderPathTemplate(template: string, values: PathTemplateValues): string {
  const segments = template
    .split(/[/\\]/)
    .map((segment) =>
      sanitizePathSegment(
        segment.replace(TOKEN, (_match, inner: string) => {
          const parsed = TAG_WITH_MODIFIER.exec(inner);
          if (!parsed?.[1]) return '';
          return tagValue(values[parsed[1]], parsed[2] === PATH_TAG_PAD_MODIFIER);
        }),
      ),
    )
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments.join('/') : EMPTY_PATH_FALLBACK;
}

/** One folder or file name made safe for every common filesystem (see `renderPathTemplate`). */
export function sanitizePathSegment(name: string): string {
  const cleaned = name
    .normalize('NFC')
    // Tabs and newlines become spaces before the other control characters are removed.
    .replace(/\s+/g, ' ')
    .replace(UNSAFE_CHARS, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const cut = truncateUtf8(cleaned, PATH_SEGMENT_MAX_BYTES);
  // Cutting may leave a trailing space or dot.
  return cut === cleaned ? cut : cut.replace(/[\s.]+$/, '');
}

function tagValue(value: string | number | null | undefined, pad: boolean): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return pad && /^\d+$/.test(text) ? text.padStart(2, '0') : text;
}

/** UTF-8 length of one code point (shared has neither DOM nor Node types for TextEncoder). */
function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

function truncateUtf8(text: string, maxBytes: number): string {
  let out = '';
  let bytes = 0;
  // Iterating a string yields whole code points, so surrogate pairs stay together.
  for (const char of text) {
    const size = utf8Length(char);
    if (bytes + size > maxBytes) return out;
    out += char;
    bytes += size;
  }
  return out;
}
