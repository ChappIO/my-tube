/**
 * Where the yt-dlp executable lives. The runner asks for the path on every spawn, so a
 * provider may swap the binary (an update) without restarting the app.
 *
 * This is the seam between the runner and the binary manager: `YtdlpBinaryService` owns
 * downloading, verifying and updating the binary and provides this token (`YTDLP_PATH` when
 * set, otherwise `CONFIG_DIR/bin/yt-dlp`); the runner only ever needs a path.
 */
export interface YtdlpBinaryLocator {
  path(): string;
}

export const YTDLP_BINARY = Symbol('YTDLP_BINARY');
