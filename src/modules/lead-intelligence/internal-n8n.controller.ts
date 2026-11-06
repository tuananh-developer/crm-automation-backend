import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  EnsureQualificationReviewerNotificationDto,
  EnrichmentCallbackDto,
  EnrichmentCallbackResponseDto,
  QualificationCallbackDto,
  QualificationCallbackResponseDto,
  ScoringCallbackDto,
  ScoringCallbackResponseDto,
} from './dto/index.js';
import {
  EnrichmentMapper,
  QualificationMapper,
  ScoringMapper,
} from './mappers/index.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';
import { DataCleaningService } from '../data-cleaning/data-cleaning.service.js';
import { DataCleaningCallbackDto } from '../data-cleaning/dto/data-cleaning-callback.dto.js';

@ApiTags('Internal n8n Webhooks')
@Controller('internal/n8n')
@UseGuards(N8nAuthGuard)
export class InternalN8nController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
    @Optional()
    @Inject(DataCleaningService)
    private readonly dataCleaningService?: DataCleaningService,
  ) {}

  @Get('leads/:leadId')
  @ApiOperation({
    summary: 'Read the minimal Lead context for WF01',
    description:
      'Service-authenticated read scoped to a pending/running lead-qualification WorkflowRun. Does not expose owner, source, conversion, or unrelated relations.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the Lead' })
  @ApiQuery({
    name: 'workflowRunId',
    required: true,
    description: 'UUID of the related lead-qualification WorkflowRun',
  })
  @ApiResponse({ status: 200, description: 'Minimal Lead context.' })
  @ApiResponse({ status: 401, description: 'Invalid n8n service credential.' })
  @ApiResponse({ status: 404, description: 'Lead or WorkflowRun not found.' })
  @ApiResponse({ status: 409, description: 'WorkflowRun is not active.' })
  async getLeadContextForN8n(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query('workflowRunId', ParseUUIDPipe) workflowRunId: string,
  ) {
    return this.leadIntelligenceService.getLeadContextForN8n(
      leadId,
      workflowRunId,
    );
  }

  @Get('leads/:leadId/interactions')
  @ApiOperation({
    summary: 'Read recent Lead interactions for WF01',
    description:
      'Service-authenticated, WorkflowRun-scoped interaction context. Returns at most 100 projected records and truncates each content field to 3000 characters.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the Lead' })
  @ApiQuery({
    name: 'workflowRunId',
    required: true,
    description: 'UUID of the related lead-qualification WorkflowRun',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Recent interaction context.' })
  @ApiResponse({ status: 400, description: 'Invalid limit.' })
  @ApiResponse({ status: 401, description: 'Invalid n8n service credential.' })
  @ApiResponse({ status: 404, description: 'Lead or WorkflowRun not found.' })
  @ApiResponse({ status: 409, description: 'WorkflowRun is not active.' })
  async getLeadInteractionContextForN8n(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Query('workflowRunId', ParseUUIDPipe) workflowRunId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.leadIntelligenceService.getLeadInteractionContextForN8n(
      leadId,
      workflowRunId,
      limit,
    );
  }

  @Post('lead-qualification/notify-reviewer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Return the existing WF01 reviewer notification receipt',
    description:
      'Read-only idempotent operation. The qualification callback owns ReviewTask and Notification creation; this route never creates a duplicate notification.',
  })
  @ApiBody({ type: EnsureQualificationReviewerNotificationDto })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: true,
    description: 'Must equal workflowRunId; this receipt route is read-only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Existing notification receipt, or notificationFound=false.',
  })
  @ApiResponse({ status: 400, description: 'Invalid idempotency key.' })
  @ApiResponse({ status: 401, description: 'Invalid n8n service credential.' })
  @ApiResponse({
    status: 404,
    description: 'WorkflowRun, qualification, or ReviewTask not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Qualification WorkflowRun is not complete.',
  })
  async ensureQualificationReviewerNotification(
    @Body() dto: EnsureQualificationReviewerNotificationDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    return this.leadIntelligenceService.ensureQualificationReviewerNotification(
      dto,
      idempotencyKey,
    );
  }

  @Post('lead-qualification/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Receive Canonical AI Qualification Callback from n8n (UC02 - WF01)',
    description:
      'Canonical route: /api/v1/internal/n8n/lead-qualification/callback. Receives qualification analysis result. Automatically transitions Lead status or creates ReviewTask if confidence <= 0.80.',
  })
  @ApiBody({ type: QualificationCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Qualification callback processed successfully.',
    type: QualificationCallbackResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async handleQualificationCallback(
    @Body() dto: QualificationCallbackDto,
  ): Promise<QualificationCallbackResponseDto> {
    const result =
      await this.leadIntelligenceService.handleQualificationCallback(dto);
    return QualificationMapper.toCallbackResponseDto(result);
  }

  @Post('lead-enrichment/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Canonical AI Enrichment Callback from n8n (UC03 - WF02)',
    description:
      'Canonical route: /api/v1/internal/n8n/lead-enrichment/callback. Receives enriched contact details and updates Lead profile.',
  })
  @ApiBody({ type: EnrichmentCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Enrichment callback processed successfully.',
    type: EnrichmentCallbackResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead or enrichment record not found.',
  })
  async handleEnrichmentCallback(
    @Body() dto: EnrichmentCallbackDto,
  ): Promise<EnrichmentCallbackResponseDto> {
    const result =
      await this.leadIntelligenceService.handleEnrichmentCallback(dto);
    return EnrichmentMapper.toCallbackResponseDto(result);
  }

  @Post('lead-scoring/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Canonical AI Scoring Callback from n8n (UC04 - WF03)',
    description:
      'Canonical route: /api/v1/internal/n8n/lead-scoring/callback. Receives calculated score and label, persisting to LeadScore.',
  })
  @ApiBody({ type: ScoringCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Scoring callback processed successfully.',
    type: ScoringCallbackResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({ status: 404, description: 'Lead or score record not found.' })
  async handleScoringCallback(
    @Body() dto: ScoringCallbackDto,
  ): Promise<ScoringCallbackResponseDto> {
    const result =
      await this.leadIntelligenceService.handleScoringCallback(dto);
    return ScoringMapper.toCallbackResponseDto(result);
  }

  @Post('data-cleaning/callback')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Canonical n8n Data Cleaning Callback (UC10 - WF08)',
    description:
      'Canonical route: /api/v1/internal/n8n/data-cleaning/callback. Receives finding report from n8n Data Cleaning Agent.',
  })
  @ApiBody({ type: DataCleaningCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Callback processed successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({ status: 404, description: 'WorkflowRun not found.' })
  @ApiResponse({
    status: 503,
    description: 'Data cleaning callback service is temporarily unavailable.',
  })
  async handleDataCleaningCallback(@Body() dto: DataCleaningCallbackDto) {
    if (!this.dataCleaningService) {
      throw new ServiceUnavailableException(
        'Data cleaning callback service is temporarily unavailable',
      );
    }
    return this.dataCleaningService.handleCallback(dto);
  }
}
