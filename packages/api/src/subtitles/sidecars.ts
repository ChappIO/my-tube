import { readdirSync, renameSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { baseLanguage, ORIG_SUFFIX } from '../ytdlp/metadata.js';
import { normalizeLang, sidecarSubtitles, type ProbedSubtitle } from '../library/playback.js';

/*
 * The subtitle sidecars next to a video and the languages a file already carries (pure, apart
 * from the two directory helpers).
 */

const ORIG_SIDECAR = new RegExp(
  `^(.*\\.[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)${ORIG_SUFFIX}(\\.(?:vtt|srt|ass|lrc))$`,
);

/**
 * The name a subtitle sidecar yt-dlp wrote for a `<lang>-orig` track (`ORIG_SUFFIX`) should
 * have: `<stem>.en-orig.vtt` → `<stem>.en.vtt`; null for any other name.
 */
export function withoutOrigSuffix(name: string): string | null {
  const match = ORIG_SIDECAR.exec(name);
  return match ? `${match[1]}${match[2]}` : null;
}

/**
 * Renames the subtitle sidecars next to `filePath` that carry yt-dlp's `-orig` suffix (see
 * `withoutOrigSuffix`), so Plex and the player read the language. A file with the plain name
 * already there is left alone.
 */
export function renameOrigSidecars(filePath: string, log: (line: string) => void): void {
  const dir = dirname(filePath);
  const stem = basename(filePath, extname(filePath));
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(`${stem}.`)) continue;
    const renamed = withoutOrigSuffix(name);
    if (!renamed || names.includes(renamed)) continue;
    renameSync(join(dir, name), join(dir, renamed));
    log(`renamed ${name} to ${renamed}`);
  }
}

/** The subtitle sidecars of the video at `filePath` (`sidecarSubtitles` over its folder). */
export function listSidecars(filePath: string) {
  const stem = basename(filePath, extname(filePath));
  let names: string[];
  try {
    names = readdirSync(dirname(filePath));
  } catch {
    return [];
  }
  return sidecarSubtitles(stem, names);
}

/**
 * The languages a video already has subtitles for: its sidecars' and its embedded text
 * streams' (as Settings codes; streams without a language do not count).
 */
export function presentLanguages(
  sidecars: readonly { lang: string }[],
  embedded: readonly ProbedSubtitle[],
): string[] {
  const langs = new Set<string>();
  for (const sidecar of sidecars) langs.add(sidecar.lang);
  for (const stream of embedded) {
    const lang = normalizeLang(stream.lang);
    if (lang !== 'und') langs.add(lang);
  }
  return [...langs];
}

/** The wanted languages none of `present` covers, matched on the base language (`en` ~ `en-US`). */
export function missingLanguages(wanted: readonly string[], present: readonly string[]): string[] {
  const bases = new Set(present.map(baseLanguage));
  return wanted.filter((lang) => !bases.has(baseLanguage(lang)));
}
