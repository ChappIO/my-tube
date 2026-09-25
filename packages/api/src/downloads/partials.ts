import { readdirSync, rmdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/** Media containers a finished download can have; a name with one of these is not a partial. */
export const FINISHED_MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  'mkv',
  'mp4',
  'webm',
  'm4a',
  'mp3',
  'opus',
  'flac',
  'ogg',
  'mov',
]);

/**
 * Removes what a cancelled download left next to `target` (the path without extension, inside
 * `root`): `.part` and `.ytdl` files, fragments, unmerged format files and temp files, and, when
 * no finished media file with that name exists, everything else with that name (thumbnails,
 * the source stream of an audio extraction). `finished` are the extensions a finished file can
 * have (a track: only its container). Then the folder, if it is empty and not `root`. Each
 * removal is reported to `log`.
 */
export function removePartials(
  root: string,
  target: string,
  log: (line: string) => void,
  finished: ReadonlySet<string> = FINISHED_MEDIA_EXTENSIONS,
): void {
  const dir = dirname(target);
  const prefix = `${basename(target)}.`;
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.startsWith(prefix));
  } catch {
    return;
  }
  const rest = (name: string) => name.slice(prefix.length);
  const isPartial = (name: string) =>
    /\.(part|ytdl)$|\.part-Frag\d+|^f\d+\.|\.temp\.|^temp\.|^orig\./.test(rest(name));
  const done = names.some((name) => !isPartial(name) && finished.has(rest(name)));
  for (const name of names) {
    if (isPartial(name) || !done) {
      rmSync(join(dir, name), { force: true });
      log(`removed ${name}`);
    }
  }
  try {
    if (readdirSync(dir).length === 0 && resolve(dir) !== resolve(root)) rmdirSync(dir);
  } catch {
    // Not empty after all, or already gone.
  }
}
