import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { RulesPreviewRequest, sourceIssues, type Job, type RulesPreview } from '@mytube/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toJobDto } from '../jobs/jobs.service.js';
import { SourcesService } from '../sources/sources.service.js';
import { RevalidationService } from './revalidation.service.js';
import { SyncService } from './sync.service.js';

@Controller()
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly revalidation: RevalidationService,
    private readonly sources: SourcesService,
  ) {}

  /** Checks one source now (whether subscribed or not). 202 with the queued or running job. */
  @Post('sources/:id/check')
  @HttpCode(202)
  check(@Param('id', ParseIntPipe) id: number): Job {
    const result = this.sync.enqueueCheck(id);
    if (!result) throw new NotFoundException(`Source ${id} not found`);
    return toJobDto(result.job);
  }

  /** Checks every subscribed source now. 202 with their jobs. */
  @Post('sync/check-all')
  @HttpCode(202)
  checkAll(): Job[] {
    return this.sync.enqueueAll().map(toJobDto);
  }

  /**
   * What saving `matcher` as the source's rules would remove from its files on disk (the Edit
   * rules modal asks before Save). Changes nothing. 400 for rules the source cannot have.
   */
  @Post('sources/:id/rules/preview')
  @HttpCode(200)
  previewRules(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(RulesPreviewRequest)) body: RulesPreviewRequest,
  ): RulesPreview {
    const source = this.sources.get(id);
    const issues = sourceIssues({
      library: source.library,
      kind: source.kind,
      matcher: body.matcher,
    });
    if (issues.length > 0) throw new BadRequestException({ message: 'Validation failed', issues });
    return this.revalidation.preview(id, body.matcher);
  }
}
