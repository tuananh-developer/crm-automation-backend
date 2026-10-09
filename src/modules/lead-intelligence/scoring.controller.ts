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
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import { ScoringCallbackDto, TriggerScoringDto } from './dto/index.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';

@ApiTags('Lead Intelligence')
@Controller(['lead-intelligence', 'scoring'])
export class ScoringController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  @Post(['score/:leadId', 'trigger/:leadId'])
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger AI Lead Scoring (UC04)',
    description:
      'Initiates AI lead scoring workflow for the lead, gathers scoring context (profile, qualification, enrichment, interactions), creates a WorkflowRun in PENDING state, and publishes lead.scoring.requested to RabbitMQ for n8n processing.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead to score' })
  @ApiBody({ type: TriggerScoringDto, required: false })
  @ApiResponse({
    status: 202,
    description: 'Lead scoring request accepted and queued.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  triggerScoring(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerScoringDto,
  ) {
    return this.leadIntelligenceService.triggerScoring(leadId, dto);
  }

  @Post(['scoring/callback', 'callback'])
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive AI Lead Scoring Callback from n8n / AI Service (UC04)',
    description:
      'Receives lead scoring evaluation results from n8n or AI service, updates WorkflowRun, saves lead score history with HOT/WARM/COLD label, and records snapshot.',
  })
  @ApiBody({ type: ScoringCallbackDto })
  @ApiResponse({
    status: 200,
    description: 'Scoring callback processed successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized n8n webhook request.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  handleCallback(@Body() dto: ScoringCallbackDto) {
    return this.leadIntelligenceService.handleScoringCallback(dto);
  }

  @Get(['scoring/context/:leadId', 'context/:leadId'])
  @ApiOperation({
    summary: 'Get aggregated scoring context for a lead (UC04)',
    description:
      'Returns aggregated lead data including profile, latest qualification, latest enrichment, and recent interaction touchpoints used as input features for AI scoring.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated scoring context details.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  getScoringContext(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getScoringContext(leadId);
  }

  @Get('scores/:leadId')
  @ApiOperation({
    summary: 'Get score history for a lead (UC04)',
    description:
      'Returns all historical AI scores and labels for the specified lead.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of all score records for the lead.',
  })
  getScores(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getScoresByLead(leadId);
  }

  @Get('scores/:leadId/latest')
  @ApiOperation({
    summary: 'Get latest score assessment for a lead (UC04)',
    description:
      'Returns the most recent AI score, label, and reasoning for the specified lead.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'Latest score assessment details.',
  })
  @ApiResponse({ status: 404, description: 'No score found for this lead.' })
  getLatestScore(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestScore(leadId);
  }
}
