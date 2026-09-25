import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads a `text/plain` request body as UTF-8, which Nest's JSON and form parsers leave in the
 * stream. 415 for another content type; 413 when it is longer than `maxBytes` (a declared
 * `Content-Length` is refused before reading, a chunked body is drained and dropped).
 */
export async function readTextBody(
  req: Request,
  maxBytes: number,
  tooLarge: string,
): Promise<string> {
  if (!req.is('text/plain')) {
    throw new HttpException(
      { message: 'Send the file as text/plain.' },
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpException({ message: tooLarge }, HttpStatus.PAYLOAD_TOO_LARGE);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= maxBytes) chunks.push(chunk);
  }
  if (size > maxBytes) {
    throw new HttpException({ message: tooLarge }, HttpStatus.PAYLOAD_TOO_LARGE);
  }
  return Buffer.concat(chunks).toString('utf8');
}
