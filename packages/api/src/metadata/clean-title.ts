/**
 * Upload decoration in a video title that is not part of a song's name: `(Official Audio)`,
 * `[Official Music Video]`, `(Lyric Video)`, `(Visualizer)`, `(Audio)`, `(Official HD Video)`.
 */
const DECORATION =
  /\s*[([]\s*(?:official\s+)?(?:(?:hd|hq|4k)\s+)?(?:(?:music|lyrics?|visuali[sz]er)\s+)?(?:audio|video|visuali[sz]er|lyrics?)(?:\s+(?:hd|hq|4k))?\s*[)\]]/gi;

/**
 * A label's release tag or a giveaway note in square brackets: `[CHOMPO RELEASE]`,
 * `[Monstercat Release]`, `[FREE DOWNLOAD]`.
 */
const RELEASE_TAG = /\s*\[(?:[^\]]*\brelease|free download)\]/gi;

/**
 * Symbols channels frame their titles with (`♪ MDK - Cutlass ♪`, `★ … ★`, `| … |`, `~ … ~`),
 * emoji included. Only at the ends: inside a title they may be part of it.
 */
const EDGE_SYMBOLS =
  /^[\s\p{Extended_Pictographic}♪♫♬♩★☆✦✧✩✪•·|~※◆◇▶►◀◁▷♡♥]+|[\s\p{Extended_Pictographic}♪♫♬♩★☆✦✧✩✪•·|~※◆◇▶►◀◁▷♡♥]+$/gu;

const QUOTED = /^(['"‘“])(.+)(['"’”])$/u;

/**
 * `<credits> - <title>`: the credits before the first dash (or bar) with spaces around it.
 * `Hyper Potions x MDK - Nocturne`, `MDK feat. Someone – Title`.
 */
const CREDITED = /^(.+?)\s+[-–—|]\s+(.+)$/su;

/** How artists are joined in upload credits: `x`, `&`, `and`, `feat.`, `ft.`, `with`, `vs.`, `,`. */
const CREDIT_SEPARATOR = /\s+(?:x|×|&|\+|and|feat\.?|ft\.?|featuring|with|vs\.?)\s+|\s*,\s*/giu;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameArtist(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'base' }) === 0;
}

/** What `parseTrackTitle` makes of an upload title. */
export interface ParsedTitle {
  /** The song's title: what the library shows, the rules see and the tags carry. */
  title: string;
  /** Artists credited next to ours in the prefix (`MDK x t+pazolite - …` → `t+pazolite`). */
  featuredArtists: string[];
  /** The upload title with only the edge symbols removed: the providers' fallback search. */
  plain: string;
}

/**
 * A track title from an upload's title, for tracks yt-dlp names no `track` for (official audio
 * and video uploads on an artist's channel, playlist entries):
 *
 * - drops symbols framing the title (`♪ … ♪`, `★`, `|`, `~`, emoji), the decoration
 *   (`(Official Audio)`) and a label's release tag (`[CHOMPO RELEASE]`);
 * - drops an `<artist> - ` prefix, also when the artist is one of several credited
 *   (`MDK x t+pazolite - Password`, `Hyper Potions x MDK - Nocturne`, `MDK feat. X - …`); the
 *   others become `featuredArtists`. Credits that do not name the artist stay (a remix of
 *   someone else's song: `DanTDM - Spacedog (MDK Remix)`);
 * - unwraps quotes around what is left.
 *
 * `Hiatus Kaiyote - 'Telescope' (Official Audio)` → `Telescope`. YouTube Music's own tracks are
 * already clean and stay as they are. The title is unchanged when nothing would be left.
 */
export function parseTrackTitle(title: string, artist: string | null): ParsedTitle {
  const plain = title.replace(EDGE_SYMBOLS, '').trim() || title;
  let clean = plain.replace(DECORATION, '').replace(RELEASE_TAG, '');
  clean = clean.replace(EDGE_SYMBOLS, '').replace(/\s+/g, ' ').trim();
  let featuredArtists: string[] = [];
  if (artist) {
    const prefix = new RegExp(`^\\s*${escapeRegExp(artist)}\\s*[-–—:|]\\s*`, 'i');
    if (prefix.test(clean)) {
      clean = clean.replace(prefix, '');
    } else {
      const credited = CREDITED.exec(clean);
      const credits = credited?.[1]?.split(CREDIT_SEPARATOR).filter((name) => name.trim()) ?? [];
      if (credited?.[2] && credits.length > 1 && credits.some((name) => sameArtist(name, artist))) {
        clean = credited[2];
        featuredArtists = credits
          .filter((name) => !sameArtist(name, artist))
          .map((name) => name.trim());
      }
    }
  }
  clean = clean.trim();
  const quoted = QUOTED.exec(clean);
  if (quoted?.[2]) clean = quoted[2].trim();
  return { title: clean || title, featuredArtists, plain };
}

/** The song's title of an upload title (`parseTrackTitle(title, artist).title`). */
export function cleanTrackTitle(title: string, artist: string | null): string {
  return parseTrackTitle(title, artist).title;
}
