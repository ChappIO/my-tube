/**
 * The diagnostic format listing (`yt-dlp -F`, warnings on) the runner makes when a call fails
 * with `Requested format is not available`, and its parsing. Pure, so it is tested on real
 * output shapes.
 */

/** Most lines of a listing written to a job log; the rest is summarised in one line. */
export const LISTING_MAX_LINES = 200;

export interface FormatListing {
  /** Everything the call printed: the command, warnings, the table, errors, the exit line. */
  lines: string[];
  /**
   * Formats with a media stream in the table (storyboards, `mhtml` images, do not count): 0
   * when yt-dlp listed none (`has no formats`, `No video formats found`, an empty table), null
   * when the listing failed otherwise (a bot check, the network), so nothing is known.
   */
  mediaFormats: number | null;
  /** Storyboard rows (`sbN mhtml … images`): formats, but nothing to download. */
  storyboards: number;
  /** Whether the listing ran with the cookies file (a signed-in session). */
  withCookies: boolean;
}

const SEPARATOR = /^[-─━]{10,}$/;
const NO_FORMATS = /has no formats|no video formats found/i;

/** Counts the formats in `-F` output (see `FormatListing`). */
export function countFormats(
  lines: readonly string[],
): Pick<FormatListing, 'mediaFormats' | 'storyboards'> {
  let inTable = false;
  let sawTable = false;
  let count = 0;
  let storyboards = 0;
  for (const line of lines) {
    const row = line.trim();
    if (row.startsWith('[info] Available formats for ')) {
      inTable = false;
      sawTable = true;
      continue;
    }
    if (sawTable && !inTable && SEPARATOR.test(row)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (row === '' || row.startsWith('[') || /^(WARNING|ERROR):|^exit /.test(row)) {
      inTable = false;
      continue;
    }
    // `ID EXT …`; storyboards are `sbN mhtml … images … storyboard`.
    const ext = row.split(/\s+/)[1] ?? '';
    if (ext === 'mhtml' || /\bstoryboard\b/i.test(row)) storyboards++;
    else count++;
  }
  if (sawTable) return { mediaFormats: count, storyboards };
  if (lines.some((line) => NO_FORMATS.test(line))) return { mediaFormats: 0, storyboards: 0 };
  // No table and no "no formats": the listing failed (a bot check, the network) or printed
  // something unknown. Nothing is known.
  return { mediaFormats: null, storyboards: 0 };
}

/** The lines a job log gets for a listing: a header, at most `LISTING_MAX_LINES`, a summary. */
export function listingLogLines(listing: FormatListing): string[] {
  const shown = listing.lines.slice(0, LISTING_MAX_LINES);
  const more = listing.lines.length - shown.length;
  const found =
    listing.mediaFormats === null
      ? 'the listing failed'
      : `${listing.mediaFormats} downloadable format${listing.mediaFormats === 1 ? '' : 's'}` +
        (listing.storyboards > 0 ? ` (and ${listing.storyboards} storyboards)` : '');
  const session = listing.withCookies ? 'with cookies' : 'without cookies';
  return [
    '--- formats (diagnostic) ---',
    ...shown,
    ...(more > 0 ? [`… (${more} more lines)`] : []),
    `--- end of formats (diagnostic): ${found}, ${session} ---`,
  ];
}
