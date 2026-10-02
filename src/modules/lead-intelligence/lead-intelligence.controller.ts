import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  QualificationCallbackDto,
  TriggerQualificationDto,
} from './dto/index.js';

@Controller('lead-intelligence')
export class LeadIntelligenceController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

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
}
