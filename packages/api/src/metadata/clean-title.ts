/**
 * Upload decoration in a video title that is not part of a song's name: `(Official Audio)`,
 * `[Official Music Video]`, `(Lyric Video)`, `(Visualizer)`, `(Audio)`, `(Official HD Video)`.
 */
const DECORATION =
  /\s*[([]\s*(?:official\s+)?(?:(?:hd|hq|4k)\s+)?(?:(?:music|lyrics?|visuali[sz]er)\s+)?(?:audio|video|visuali[sz]er|lyrics?)(?:\s+(?:hd|hq|4k))?\s*[)\]]/gi;

const QUOTED = /^(['"‘“])(.+)(['"’”])$/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A track title from an upload's title, for tracks yt-dlp names no `track` for (official audio
 * and video uploads on an artist's channel, playlist entries): drops the decoration
 * (`(Official Audio)`), an `<artist> - ` prefix and quotes around what is left.
 * `Hiatus Kaiyote - 'Telescope' (Official Audio)` → `Telescope`. YouTube Music's own tracks are
 * already clean and stay as they are. Returns the title unchanged when nothing would be left.
 */
export function cleanTrackTitle(title: string, artist: string | null): string {
  let clean = title.replace(DECORATION, '');
  if (artist) {
    clean = clean.replace(new RegExp(`^\\s*${escapeRegExp(artist)}\\s*[-–—:|]\\s*`, 'i'), '');
  }
  clean = clean.replace(/\s+/g, ' ').trim();
  const quoted = QUOTED.exec(clean);
  if (quoted?.[2]) clean = quoted[2].trim();
  return clean || title;
}
