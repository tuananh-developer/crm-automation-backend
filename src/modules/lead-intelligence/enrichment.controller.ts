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
import { EnrichmentCallbackDto, TriggerEnrichmentDto } from './dto/index.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';

@ApiTags('Lead Enrichment')
@Controller('enrichment')
export class EnrichmentController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

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

  @Post('trigger/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Lead Enrichment (UC03)',
    description:
      'Initiates AI lead enrichment workflow, creates WorkflowRun and LeadEnrichment records in PENDING state, and publishes lead.enrichment.requested to RabbitMQ.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead to enrich' })
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

  @Post('callback')
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
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead or enrichment record not found.',
  })
  handleCallback(@Body() dto: EnrichmentCallbackDto) {
    return this.leadIntelligenceService.handleEnrichmentCallback(dto);
  }

  @Get('lead/:leadId')
  @ApiOperation({ summary: 'Get all enrichment history for a lead' })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of all enrichment records for the lead.',
  })
  getEnrichmentsByLead(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getEnrichmentsByLead(leadId);
  }

  @Get('lead/:leadId/latest')
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
