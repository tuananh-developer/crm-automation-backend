import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoringCallbackDto, TriggerScoringDto } from './dto/index.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';

@Controller('scoring')
export class ScoringController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  @Post('trigger/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerScoring(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerScoringDto,
  ) {
    return this.leadIntelligenceService.triggerScoring(leadId, dto);
  }

  @Post('callback')
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  handleCallback(@Body() dto: ScoringCallbackDto) {
    return this.leadIntelligenceService.handleScoringCallback(dto);
  }

  @Get('context/:leadId')
  getScoringContext(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getScoringContext(leadId);
  }

  @Get('scores/:leadId')
  getScores(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getScoresByLead(leadId);
  }

  @Get('scores/:leadId/latest')
  getLatestScore(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestScore(leadId);
  }
}
