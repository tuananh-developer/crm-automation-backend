import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  QualificationCallbackDto,
  TriggerEnrichmentDto,
  TriggerQualificationDto,
} from './dto/index.js';

@ApiTags('Lead Intelligence')
@Controller('lead-intelligence')
export class LeadIntelligenceController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  @Post('qualify/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Lead Qualification (UC02)',
    description:
      'Initiates AI qualification workflow for the lead, creates a WorkflowRun in PENDING state, and publishes lead.qualification.requested to RabbitMQ for n8n processing.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead to qualify' })
  @ApiBody({ type: TriggerQualificationDto, required: false })
  @ApiResponse({
    status: 202,
    description: 'Qualification request accepted and queued.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  triggerQualification(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerQualificationDto,
  ) {
    return this.leadIntelligenceService.triggerQualification(leadId, dto);
  }

  @Post('qualification/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive AI Qualification Callback from n8n / AI Service',
    description:
      'Receives qualification analysis result. If confidence >= 0.8, automatically transitions Lead status. If confidence < 0.8 or review required, creates a ReviewTask for manual evaluation.',
  })
  @ApiBody({ type: QualificationCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Qualification callback processed successfully.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  handleCallback(@Body() dto: QualificationCallbackDto) {
    return this.leadIntelligenceService.handleQualificationCallback(dto);
  }

  @Get('qualifications/:leadId')
  @ApiOperation({ summary: 'Get all qualification history for a lead' })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of all qualification records for the lead.',
  })
  getQualifications(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getQualificationsByLead(leadId);
  }

  @Get('qualifications/:leadId/latest')
  @ApiOperation({ summary: 'Get latest qualification assessment for a lead' })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Latest qualification assessment details.',
  })
  @ApiResponse({
    status: 404,
    description: 'No qualification found for this lead.',
  })
  getLatestQualification(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestQualification(leadId);
  }

  @Get('mock-enrichment')
  @ApiOperation({
    summary: 'Mock external enrichment service for testing & n8n',
    description:
      'Simulates an external enrichment provider (Clearbit / Apollo / Mock) for local development and n8n workflows.',
  })
  @ApiQuery({
    name: 'domain',
    required: false,
    description: 'Company domain to enrich',
  })
  @ApiQuery({
    name: 'email',
    required: false,
    description: 'Contact email to extract domain from',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Enrichment provider name (default: mock)',
  })
  @ApiQuery({
    name: 'fail',
    required: false,
    description:
      'Set to "true" to simulate an external 500 error for retry testing',
  })
  @ApiResponse({
    status: 200,
    description: 'Mock enrichment payload returned successfully.',
  })
  @HttpCode(HttpStatus.OK)
  mockEnrichment(
    @Query('domain') domain?: string,
    @Query('email') email?: string,
    @Query('provider') provider?: string,
    @Query('fail') fail?: string,
  ) {
    return this.leadIntelligenceService.mockEnrichment({
      domain,
      email,
      provider,
      fail,
    });
  }

  // ── Lead Enrichment Endpoints (UC03) ────────────────────────────────────────

  @Post('enrich/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Lead Enrichment (UC03)',
    description:
      'Initiates AI lead enrichment workflow, creates WorkflowRun and LeadEnrichment records in PENDING state, and publishes lead.enrichment.requested to RabbitMQ.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead to enrich' })
  @ApiBody({ type: TriggerEnrichmentDto, required: false })
  @ApiResponse({
    status: 202,
    description: 'Enrichment request accepted and queued.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  triggerEnrichment(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerEnrichmentDto,
  ) {
    return this.leadIntelligenceService.triggerEnrichment(leadId, dto);
  }

  @Get('enrichments/:leadId')
  @ApiOperation({ summary: 'Get all enrichment history for a lead' })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of all enrichment records for the lead.',
  })
  getEnrichments(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getEnrichmentsByLead(leadId);
  }

  @Get('enrichments/:leadId/latest')
  @ApiOperation({ summary: 'Get latest enrichment result for a lead' })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Latest enrichment result details.',
  })
  @ApiResponse({
    status: 404,
    description: 'No enrichment found for this lead.',
  })
  getLatestEnrichment(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestEnrichment(leadId);
  }
}
