import { join } from 'node:path';
import type { AppConfig } from '../config/app-config.js';

/**
 * Where the yt-dlp executable lives. The runner asks for the path on every spawn, so a
 * provider may swap the binary (an update) without restarting the app.
 *
 * This is the seam between the runner and the binary manager: the manager owns
 * downloading, verifying and updating the binary and provides this token; the runner
 * only ever needs a path.
 */
export interface YtdlpBinaryLocator {
  path(): string;
}

export const YTDLP_BINARY = Symbol('YTDLP_BINARY');

/**
 * Default locator until the binary manager exists: `YTDLP_PATH` when set (dev machines,
 * tests with the fake binary), otherwise `CONFIG_DIR/bin/yt-dlp`.
 */
export function defaultBinaryLocator(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): YtdlpBinaryLocator {
  return {
    path: () => env.YTDLP_PATH || join(config.configDir, 'bin', 'yt-dlp'),
  };
}
