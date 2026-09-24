import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateSource,
  ListSourcesQuery,
  ResolveRequest,
  SetSubscribed,
  UpdateSource,
  type ResolvedSource,
  type Source,
} from '@mytube/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { SourcesService } from './sources.service.js';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  /** What a pasted link points at, for the Add modal. Stores nothing. */
  @Post('resolve')
  @HttpCode(200)
  resolve(
    @Body(new ZodValidationPipe(ResolveRequest)) body: ResolveRequest,
  ): Promise<ResolvedSource> {
    return this.sources.resolve(body.url);
  }

  /** Every source, newest first; `?library=video|music` filters. */
  @Get()
  list(@Query(new ZodValidationPipe(ListSourcesQuery)) query: ListSourcesQuery): Source[] {
    return this.sources.list(query.library);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Source {
    return this.sources.get(id);
  }

  /** Adds a source (subscribed) from a link. 409 with `sourceId` when it already exists. */
  @Post()
  create(@Body(new ZodValidationPipe(CreateSource)) body: CreateSource): Promise<Source> {
    return this.sources.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateSource)) body: UpdateSource,
  ): Source {
    return this.sources.update(id, body);
  }

  /** The bell. Unsubscribing never deletes anything. */
  @Patch(':id/subscribed')
  setSubscribed(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SetSubscribed)) body: SetSubscribed,
  ): Source {
    return this.sources.setSubscribed(id, body.subscribed);
  }

  /** Removes the source only. Media and catalog rows stay. */
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number): void {
    this.sources.remove(id);
  }
}
