import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { COOKIES_MAX_BYTES, type CookiesStatus, MANAGED_COOKIES_FILE } from '@mytube/shared';
import { AppConfig } from '../config/app-config.js';
import { SettingsService } from '../settings/settings.service.js';
import { parseCookies, summarizeCookies, validateCookies } from './cookies-file.js';

/** Owner read and write only: the file holds a signed-in Google session. */
export const COOKIES_MODE = 0o600;

/**
 * The cookies file yt-dlp gets with `--cookies`. MyTube manages `CONFIG_DIR/cookies.txt`
 * (uploaded or pasted in Settings → Advanced → Network) and points `network.cookiesFile` at it;
 * a path set by hand (a file the user mounts) keeps working and is reported as unmanaged.
 * Never logs or returns cookie names or values. The backup job copies the database only, so the
 * file is not in backups.
 */
@Injectable()
export class CookiesService {
  private readonly logger = new Logger(CookiesService.name);

  constructor(
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
  ) {}

  /** `CONFIG_DIR/cookies.txt`. */
  managedPath(): string {
    return join(this.config.configDir, MANAGED_COOKIES_FILE);
  }

  status(): CookiesStatus {
    const path = this.settings.get().network.cookiesFile;
    const empty = { cookieCount: null, domains: [], updatedAt: null, expiresSoonest: null };
    if (path === null) return { managed: false, path: null, ...empty };
    const managed = path === this.managedPath();
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.size > COOKIES_MAX_BYTES) return { managed, path, ...empty };
      const summary = summarizeCookies(parseCookies(readFileSync(path, 'utf8')));
      return { managed, path, ...summary, updatedAt: stat.mtime.toISOString() };
    } catch {
      // Missing or unreadable (a mount that is not there): the path is still what yt-dlp gets.
      return { managed, path, ...empty };
    }
  }

  /**
   * Validates `text` (throws `CookiesFileError`), writes it to the managed file through a temp
   * file with mode 0600 and a rename, so yt-dlp never reads half a file, and points
   * `network.cookiesFile` at it.
   */
  save(text: string): CookiesStatus {
    const { text: body, count } = validateCookies(text, COOKIES_MAX_BYTES);
    const path = this.managedPath();
    mkdirSync(this.config.configDir, { recursive: true });
    const temp = join(this.config.configDir, `.cookies-${randomBytes(6).toString('hex')}.tmp`);
    try {
      writeFileSync(temp, body, { mode: COOKIES_MODE, flag: 'wx' });
      chmodSync(temp, COOKIES_MODE); // a umask only narrows the mode; set it exactly anyway
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
    if (this.settings.get().network.cookiesFile !== path) {
      this.settings.patch({ network: { cookiesFile: path } });
    }
    this.logger.log(`Cookies file saved (${count} cookies).`);
    return this.status();
  }

  /**
   * Removes the managed file and, when `network.cookiesFile` points at it, clears the setting.
   * A path set by hand is left alone (and so is the file it names).
   */
  remove(): CookiesStatus {
    const path = this.managedPath();
    rmSync(path, { force: true });
    if (this.settings.get().network.cookiesFile === path) {
      this.settings.patch({ network: { cookiesFile: null } });
    }
    this.logger.log('Cookies file removed.');
    return this.status();
  }
}
