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
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import {
  QualificationCallbackDto,
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
}
