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
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  EnrichmentCallbackDto,
  QualificationCallbackDto,
  TriggerEnrichmentDto,
  TriggerQualificationDto,
} from './dto/index.js';

@Controller('lead-intelligence')
export class LeadIntelligenceController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  // ── Qualification Endpoints (UC02) ────────────────────────────────────────

  @Post('qualify/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerQualification(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerQualificationDto,
  ) {
    return this.leadIntelligenceService.triggerQualification(leadId, dto);
  }

  @Post('qualification/callback')
  @HttpCode(HttpStatus.OK)
  handleCallback(@Body() dto: QualificationCallbackDto) {
    return this.leadIntelligenceService.handleQualificationCallback(dto);
  }

  @Get('qualifications/:leadId')
  getQualifications(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getQualificationsByLead(leadId);
  }

  @Get('qualifications/:leadId/latest')
  getLatestQualification(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestQualification(leadId);
  }

  // ── Enrichment Endpoints (UC03) ───────────────────────────────────────────

  @Post('enrich/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerEnrichment(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerEnrichmentDto,
  ) {
    return this.leadIntelligenceService.triggerEnrichment(leadId, dto);
  }

  @Post('enrichment/callback')
  @HttpCode(HttpStatus.OK)
  handleEnrichmentCallback(@Body() dto: EnrichmentCallbackDto) {
    return this.leadIntelligenceService.handleEnrichmentCallback(dto);
  }

  @Get('enrichments/:leadId')
  getEnrichments(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getEnrichmentsByLead(leadId);
  }

  @Get('enrichments/:leadId/latest')
  getLatestEnrichment(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestEnrichment(leadId);
  }

  @Get('mock-enrichment')
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
}
