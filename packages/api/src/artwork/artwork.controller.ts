import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArtworkKind } from '@mytube/shared';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { sendFile } from '../files/send-file.js';
import { ArtworkService, ArtworkUnavailableError } from './artwork.service.js';

/** Browsers may keep an image for a day; the ETag revalidates it after that. */
const ARTWORK_MAX_AGE_MS = 86_400_000;
export const ARTWORK_RETRY_AFTER_SECONDS = 5;

@Controller('artwork')
export class ArtworkController {
  constructor(private readonly artwork: ArtworkService) {}

  /**
   * A cached avatar or thumbnail (`kind` = `channel`, `artist`, `video`, `playlist`; `id` = the
   * row id). 404 without one; 503 with `Retry-After: 5` while the remote host refuses.
   */
  @Get(':kind/:id')
  async serve(
    @Param('kind', new ZodValidationPipe(ArtworkKind)) kind: ArtworkKind,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    let file;
    try {
      file = await this.artwork.locate(kind, id);
    } catch (error) {
      if (error instanceof ArtworkUnavailableError) {
        res.setHeader('Retry-After', String(ARTWORK_RETRY_AFTER_SECONDS));
        res.setHeader('Cache-Control', 'no-store');
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
    await sendFile(res, file.path, {
      maxAge: ARTWORK_MAX_AGE_MS,
      contentType: file.contentType,
    });
  }
}
