import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { FINISHED_MEDIA_EXTENSIONS } from '../downloads/partials.js';

/**
 * Names a download or the tag writer leaves while working: yt-dlp's `.part` and `.ytdl` files,
 * fragments, unmerged format streams (`name.f137.mp4`), temp files (`name.temp.mp4`) and the
 * tag writer's `.<name>.tagging.<ext>`.
 */
const PARTIAL = /\.(?:part|ytdl)$|\.part-Frag\d+|\.f\d+\.[^.]+$|\.temp\.[^.]+$|\.tagging\.[^.]+$/i;

/** A finished media file by its name: a media container, not a partial, not hidden. */
export function isMediaFileName(name: string): boolean {
  if (name.startsWith('.') || PARTIAL.test(name)) return false;
  return FINISHED_MEDIA_EXTENSIONS.has(extname(name).slice(1).toLowerCase());
}

/** Folder and file names the walk never enters or reports: hidden, NAS metadata, recycle bins. */
function skipped(name: string): boolean {
  return name.startsWith('.') || name.startsWith('@') || name.startsWith('#');
}

/**
 * Every finished media file under `root`, as paths relative to it with `/` separators (the form
 * `file_path` is stored in), sorted. Hidden entries (`.DS_Store`, temp files) and NAS metadata
 * folders (`@eaDir`, `#recycle`) are skipped, symlinks are not followed, and sidecars
 * (thumbnails, subtitles) and partial downloads are not media files. A missing root is empty.
 * Throws when `signal` fires.
 */
export async function listMediaFiles(root: string, signal?: AbortSignal): Promise<string[]> {
  const found: string[] = [];
  const pending: string[] = [''];
  while (pending.length > 0) {
    signal?.throwIfAborted();
    const relative = pending.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(join(root, relative), { withFileTypes: true });
    } catch {
      // The mount is missing, or a folder vanished while walking.
      continue;
    }
    for (const entry of entries) {
      if (skipped(entry.name)) continue;
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && isMediaFileName(entry.name)) found.push(path);
    }
  }
  return found.toSorted();
}
