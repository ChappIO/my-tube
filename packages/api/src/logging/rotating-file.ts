import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

export interface RotatingFileOptions {
  /** Rotate before a write would make the file larger than this. Default 5 MB. */
  maxBytes?: number;
  /** Rotated files kept next to it (`.1` newest … `.<keep>` oldest). Default 3. */
  keep?: number;
}

export const LOG_MAX_BYTES = 5 * 1024 * 1024;
export const LOG_ROTATIONS_KEPT = 3;

/**
 * An append-only text file rotated by size: `mytube.log` is current, `mytube.log.1` the one
 * before, up to `mytube.log.<keep>`; older files are deleted. Writes are synchronous, so lines
 * keep their order and nothing is lost when the process dies. A write error (full disk,
 * read-only mount) is swallowed after one report through `onError`: logging must never take the
 * app down.
 */
export class RotatingFile {
  private fd: number | null = null;
  private size = 0;
  private failed = false;
  private readonly maxBytes: number;
  private readonly keep: number;

  constructor(
    readonly path: string,
    options: RotatingFileOptions = {},
    private readonly onError: (error: unknown) => void = () => {},
  ) {
    this.maxBytes = options.maxBytes ?? LOG_MAX_BYTES;
    this.keep = options.keep ?? LOG_ROTATIONS_KEPT;
  }

  write(text: string): void {
    try {
      const bytes = Buffer.byteLength(text);
      if (this.fd === null) this.open();
      if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate();
      writeSync(this.fd!, text);
      this.size += bytes;
      this.failed = false;
    } catch (error) {
      if (!this.failed) this.onError(error);
      this.failed = true;
      this.closeQuietly();
    }
  }

  close(): void {
    this.closeQuietly();
  }

  private open(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    this.fd = openSync(this.path, 'a');
    this.size = statSync(this.path).size;
  }

  private rotate(): void {
    this.closeQuietly();
    rmSync(`${this.path}.${this.keep}`, { force: true });
    for (let n = this.keep - 1; n >= 1; n--) {
      const from = `${this.path}.${n}`;
      if (existsSync(from)) renameSync(from, `${this.path}.${n + 1}`);
    }
    if (this.keep > 0) renameSync(this.path, `${this.path}.1`);
    else rmSync(this.path, { force: true });
    this.open();
  }

  private closeQuietly(): void {
    if (this.fd === null) return;
    try {
      closeSync(this.fd);
    } catch {
      // Already closed.
    }
    this.fd = null;
  }
}
