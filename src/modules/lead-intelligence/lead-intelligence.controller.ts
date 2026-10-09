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
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiAcceptedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Lead Intelligence')
@ApiBearerAuth('JWT-auth')
@Controller('lead-intelligence')
export class LeadIntelligenceController {
  constructor(
    private readonly leadIntelligenceService: LeadIntelligenceService,
  ) {}

  @Post('qualify/:leadId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger lead qualification',
    description: 'Triggers AI-based qualification for a lead',
  })
  @ApiAcceptedResponse({ description: 'Qualification triggered successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  @ApiParam({
    name: 'leadId',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  triggerQualification(
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto?: TriggerQualificationDto,
  ) {
    return this.leadIntelligenceService.triggerQualification(leadId, dto);
  }

  @Post('qualification/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle qualification callback',
    description: 'Receives callback from AI qualification workflow',
  })
  @ApiOkResponse({ description: 'Callback processed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid callback data' })
  handleCallback(@Body() dto: QualificationCallbackDto) {
    return this.leadIntelligenceService.handleQualificationCallback(dto);
  }

  @Get('qualifications/:leadId')
  @ApiOperation({
    summary: 'Get all qualifications for a lead',
    description: 'Returns all qualification records for a specific lead',
  })
  @ApiOkResponse({ description: 'Qualifications retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiParam({
    name: 'leadId',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  getQualifications(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getQualificationsByLead(leadId);
  }

  @Get('qualifications/:leadId/latest')
  @ApiOperation({
    summary: 'Get latest qualification for a lead',
    description:
      'Returns the most recent qualification record for a specific lead',
  })
  @ApiOkResponse({ description: 'Latest qualification retrieved successfully' })
  @ApiNotFoundResponse({
    description: 'Lead not found or no qualifications exist',
  })
  @ApiParam({
    name: 'leadId',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  getLatestQualification(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.leadIntelligenceService.getLatestQualification(leadId);
  }
}
