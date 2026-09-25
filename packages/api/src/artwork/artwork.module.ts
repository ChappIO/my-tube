import { Module } from '@nestjs/common';
import { ArtworkController } from './artwork.controller.js';
import { ArtworkService } from './artwork.service.js';

/** The artwork cache: `GET /api/artwork/:kind/:id` (see `ArtworkService`). */
@Module({
  controllers: [ArtworkController],
  providers: [ArtworkService],
  exports: [ArtworkService],
})
export class ArtworkModule {}
