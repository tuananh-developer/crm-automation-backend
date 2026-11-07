import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  EnrichmentCallbackDto,
  EnrichmentCallbackResponseDto,
  EnrichmentResponseDto,
  MockEnrichmentResponseDto,
  TriggerEnrichmentDto,
  TriggerEnrichmentResponseDto,
} from './dto/index.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { JwtOrN8nAuthGuard } from '../../common/guards/jwt-or-n8n-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { EnrichmentMapper } from './mappers/index.js';

@ApiTags('Lead Enrichment')
@Controller(['leads', 'enrichment', 'internal/n8n/lead-enrichment'])
export class EnrichmentController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  @Get('mock-enrichment')
  @UseGuards(JwtOrN8nAuthGuard)
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
    type: MockEnrichmentResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  mockEnrichment(
    @Query('domain') domain?: string,
    @Query('email') email?: string,
    @Query('provider') provider?: string,
    @Query('fail') fail?: string,
  ): MockEnrichmentResponseDto {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Mock enrichment endpoint is disabled in production',
      );
    }
    return this.leadIntelligenceService.mockEnrichment({
      domain,
      email,
      provider,
      fail,
    });
  }

  @Post([':leadId/enrichments', 'trigger/:leadId'])
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Trigger AI Lead Enrichment (UC03 - Canonical route: POST /api/v1/leads/:leadId/enrichments)',
    description:
      'Initiates AI lead enrichment workflow, creates WorkflowRun and LeadEnrichment records in PENDING state, and publishes lead.enrichment.requested to RabbitMQ.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead to enrich' })
  @ApiResponse({
    status: 202,
    description: 'Enrichment request accepted and queued.',
    type: TriggerEnrichmentResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  async triggerEnrichment(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerEnrichmentDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<TriggerEnrichmentResponseDto> {
    return this.leadIntelligenceService.triggerEnrichment(leadId, dto, user);
  }

  @Post(['callback', '/internal/n8n/lead-enrichment/callback'])
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Enrichment Callback from n8n / AI Service',
    description:
      'Receives enriched company and contact details, updates Lead profile, and transitions WorkflowRun and LeadEnrichment to completed/failed status.',
  })
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
  @ApiResponse({
    status: 409,
    description:
      'Conflict: WorkflowRun already in terminal state or conflicting callback payload.',
  })
  async handleCallback(
    @Body() dto: EnrichmentCallbackDto,
  ): Promise<EnrichmentCallbackResponseDto> {
    const result =
      await this.leadIntelligenceService.handleEnrichmentCallback(dto);
    return EnrichmentMapper.toCallbackResponseDto(result);
  }

  @Get([':leadId/enrichments', 'lead/:leadId'])
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get all enrichment history for a lead (canonical: GET /api/v1/leads/:leadId/enrichments)',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of all enrichment records for the lead.',
    type: [EnrichmentResponseDto],
  })
  async getEnrichmentsByLead(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<EnrichmentResponseDto[]> {
    const records = await this.leadIntelligenceService.getEnrichmentsByLead(
      leadId,
      user,
    );
    return EnrichmentMapper.toResponseDtoList(records);
  }

  @Get([':leadId/enrichments/latest', 'lead/:leadId/latest'])
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Get latest enrichment result for a lead (canonical: GET /api/v1/leads/:leadId/enrichments/latest)',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Latest enrichment result details.',
    type: EnrichmentResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'No enrichment found for this lead.',
  })
  async getLatestEnrichment(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<EnrichmentResponseDto | null> {
    const record = await this.leadIntelligenceService.getLatestEnrichment(
      leadId,
      user,
    );
    return record ? EnrichmentMapper.toResponseDto(record) : null;
  }

  @Get([':leadId/enrichments/internal', 'lead/:leadId/internal'])
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal service: Get all enrichment history for a lead',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  async getEnrichmentsByLeadInternal(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<EnrichmentResponseDto[]> {
    const records =
      await this.leadIntelligenceService.getEnrichmentsByLead(leadId);
    return EnrichmentMapper.toResponseDtoList(records);
  }

  @Get([':leadId/enrichments/latest/internal', 'lead/:leadId/latest/internal'])
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal service: Get latest enrichment result for a lead',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  async getLatestEnrichmentInternal(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<EnrichmentResponseDto | null> {
    const record =
      await this.leadIntelligenceService.getLatestEnrichment(leadId);
    return record ? EnrichmentMapper.toResponseDto(record) : null;
  }
}
