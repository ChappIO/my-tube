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
