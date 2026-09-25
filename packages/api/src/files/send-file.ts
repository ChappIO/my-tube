import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';

export interface SendFileOptions {
  /** `Cache-Control: public, max-age=<s>`; 0 (the default) means revalidate every time. */
  maxAge?: number;
  /** Overrides the type Express derives from the extension. */
  contentType?: string | null;
}

/**
 * Sends a file with Express's `sendFile`: `ETag`, `Last-Modified`, conditional GETs (304) and
 * HTTP Range requests (206, `Accept-Ranges: bytes`) come with it. Dot-directories are allowed
 * (a checkout under `.claude/worktrees` is a normal place for the library in development).
 * Resolves when the response is done; a file that cannot be read before anything was sent is a
 * 404, and a client that went away mid-stream is not an error.
 */
export function sendFile(
  res: Response,
  path: string,
  options: SendFileOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    res.sendFile(
      path,
      {
        dotfiles: 'allow',
        maxAge: options.maxAge ?? 0,
        headers: options.contentType ? { 'Content-Type': options.contentType } : undefined,
      },
      (error) => {
        if (!error || res.headersSent) resolve();
        else reject(new NotFoundException('File not found'));
      },
    );
  });
}
