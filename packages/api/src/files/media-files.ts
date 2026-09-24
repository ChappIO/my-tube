import { readdirSync, rmdirSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

/**
 * Sidecars written next to a media file, by what follows `<stem>.`: the thumbnail
 * (`<stem>.jpg`, also png/webp before conversion) and subtitles or other per-language files
 * (`<stem>.en.vtt`, `<stem>.pt-BR.srt`). Nothing else with the same stem is touched.
 */
const SIDECAR =
  /^(?:[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*\.)?(?:jpg|jpeg|png|webp|vtt|srt|ass|lrc)$/i;

export class OutsideLibraryError extends Error {
  override readonly name = 'OutsideLibraryError';
}

/**
 * `root/relativePath` as an absolute path, refusing anything that would land outside `root`
 * (`..`, absolute paths). The second lock after the path templates' own sanitising.
 */
export function libraryPath(root: string, relativePath: string): string {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  if (!target.startsWith(base + sep)) {
    throw new OutsideLibraryError(`Refusing to touch a path outside the library: ${relativePath}`);
  }
  return target;
}

/**
 * Deletes a media file (`relativePath` under `root`, with its extension), its sidecars
 * (thumbnail, subtitles; see `SIDECAR`) and then every folder on the way up to `root` that is
 * left empty. A file that is already gone is not an error. Returns the names of the files it
 * removed, for the job log.
 */
export function removeMediaFiles(root: string, relativePath: string): string[] {
  const file = libraryPath(root, relativePath);
  const dir = dirname(file);
  const stem = basename(file, extname(file));
  const removed: string[] = [];
  rmSync(file, { force: true });
  removed.push(basename(file));
  let names: string[] = [];
  try {
    names = readdirSync(dir).toSorted();
  } catch {
    // The folder is gone too.
  }
  for (const name of names) {
    if (name.startsWith(`${stem}.`) && SIDECAR.test(name.slice(stem.length + 1))) {
      rmSync(join(dir, name), { force: true });
      removed.push(name);
    }
  }
  removeEmptyFolders(root, dir);
  return removed;
}

/** Removes `dir` and its parents while they are empty, stopping at `root` (never removed). */
export function removeEmptyFolders(root: string, dir: string): void {
  const base = resolve(root);
  let current = resolve(dir);
  while (current.startsWith(base + sep)) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}
