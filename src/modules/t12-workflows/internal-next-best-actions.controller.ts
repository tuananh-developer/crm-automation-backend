import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { NextBestActionsService, WF10_NAME } from './next-best-actions.service.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';
import {
  NextBestActionCallbackDto,
  NextBestActionReviewDto,
  NextBestActionContextQueryDto,
  ClaimNextBestActionContextDto,
} from './dto/index.js';

@ApiTags('Internal n8n — WF10 Next Best Action')
@Controller('internal/n8n/next-best-actions')
@UseGuards(N8nAuthGuard)
export class InternalNextBestActionsController {
  constructor(
    private readonly service: NextBestActionsService,
    private readonly claims: WorkflowExecutionClaimsService,
  ) {}

  @Get('entity-context')
  @ApiOperation({ summary: 'Read scoped Lead/Customer profile for WF10' })
  @ApiQuery({ name: 'entityType', enum: ['Lead', 'Customer'], required: true })
  @ApiQuery({ name: 'entityId', required: true })
  @ApiQuery({ name: 'workflowRunId', required: true })
  getEntityContext(@Query() query: NextBestActionContextQueryDto) {
    return this.service.getEntityProfile(
      query.entityType,
      query.entityId,
      query.workflowRunId,
    );
  }

  @Post('claim-and-entity-context')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Atomically claim a WF10 execution and return its scoped entity profile',
    description:
      'A competing execution receives HTTP 409 before AI processing. Retrying the claim from the winning execution is idempotent.',
  })
  @ApiBody({ type: ClaimNextBestActionContextDto })
  async claimAndGetEntityContext(@Body() dto: ClaimNextBestActionContextDto) {
    const context = await this.service.getEntityProfile(
      dto.entityType,
      dto.entityId,
      dto.workflowRunId,
    );
    const claim = await this.claims.claim({
      workflowRunId: dto.workflowRunId,
      workflowName: WF10_NAME,
      n8nExecutionId: dto.n8nExecutionId,
    });
    if (!claim.claimed) {
      throw new ConflictException(
        'WorkflowRun is already claimed by another n8n execution or is no longer active',
      );
    }
    return context;
  }

  @Get('intelligence-context')
  @ApiOperation({
    summary: 'Read latest qualification and canonical score context for WF10',
  })
  getIntelligenceContext(@Query() query: NextBestActionContextQueryDto) {
    return this.service.getIntelligenceContext(
      query.entityType,
      query.entityId,
      query.workflowRunId,
    );
  }

  @Get('interactions')
  @ApiOperation({ summary: 'Read bounded interaction history for WF10' })
  getInteractions(@Query() query: NextBestActionContextQueryDto) {
    return this.service.getInteractionHistory(
      query.entityType,
      query.entityId,
      query.workflowRunId,
    );
  }

  @Get('follow-up-segment-context')
  @ApiOperation({
    summary:
      'Read follow-up and segment context plus backend allowlisted actions',
  })
  getFollowUpSegmentContext(@Query() query: NextBestActionContextQueryDto) {
    return this.service.getFollowUpSegmentContext(
      query.entityType,
      query.entityId,
      query.workflowRunId,
    );
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: NextBestActionCallbackDto })
  saveRecommendation(@Body() dto: NextBestActionCallbackDto) {
    return this.service.saveRecommendation(dto);
  }

  @Post('review')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: NextBestActionReviewDto })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createReview(
    @Body() dto: NextBestActionReviewDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.service.createReviewOrNotification(dto, key);
  }
}
