import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FollowUpService } from './follow-up.service.js';
import type { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import type { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Follow-ups')
@ApiBearerAuth('JWT-auth')
@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get('enrollments/by-lead/:leadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enrollments by lead ID',
    description: 'Returns all follow-up enrollments for a specific lead',
  })
  @ApiOkResponse({ description: 'Enrollments retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Lead not found' })
  @ApiParam({
    name: 'leadId',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  async getEnrollmentsByLeadId(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<LeadFollowUpEnrollment[]> {
    return this.followUpService.getEnrollmentsByLeadId(leadId);
  }

  @Get('enrollments/by-lead/:leadId/active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get active enrollment by lead ID',
    description: 'Returns the active follow-up enrollment for a specific lead',
  })
  @ApiOkResponse({ description: 'Active enrollment retrieved successfully' })
  @ApiNotFoundResponse({
    description: 'Lead not found or no active enrollment',
  })
  @ApiParam({
    name: 'leadId',
    type: String,
    format: 'uuid',
    description: 'Lead UUID',
  })
  async getActiveEnrollmentByLeadId(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<LeadFollowUpEnrollment | null> {
    return this.followUpService.getActiveEnrollmentByLeadId(leadId);
  }

  @Get('enrollments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get enrollment by ID',
    description: 'Returns a single follow-up enrollment by its UUID',
  })
  @ApiOkResponse({ description: 'Enrollment retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Enrollment UUID',
  })
  async getEnrollmentById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFollowUpEnrollment | null> {
    return this.followUpService.getEnrollmentById(id);
  }

  @Get('enrollments/:id/executions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get executions by enrollment ID',
    description: 'Returns all follow-up executions for a specific enrollment',
  })
  @ApiOkResponse({ description: 'Executions retrieved successfully' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'Enrollment UUID',
  })
  async getExecutionsByEnrollmentId(
    @Param('id', ParseUUIDPipe) enrollmentId: string,
  ): Promise<FollowUpExecution[]> {
    return this.followUpService.getExecutionsByEnrollmentId(enrollmentId);
  }
}
