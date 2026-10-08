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

@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get('enrollments/by-lead/:leadId')
  @HttpCode(HttpStatus.OK)
  async getEnrollmentsByLeadId(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<LeadFollowUpEnrollment[]> {
    return this.followUpService.getEnrollmentsByLeadId(leadId);
  }

  @Get('enrollments/by-lead/:leadId/active')
  @HttpCode(HttpStatus.OK)
  async getActiveEnrollmentByLeadId(
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<LeadFollowUpEnrollment | null> {
    return this.followUpService.getActiveEnrollmentByLeadId(leadId);
  }

  @Get('enrollments/:id')
  @HttpCode(HttpStatus.OK)
  async getEnrollmentById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFollowUpEnrollment | null> {
    return this.followUpService.getEnrollmentById(id);
  }

  @Get('enrollments/:id/executions')
  @HttpCode(HttpStatus.OK)
  async getExecutionsByEnrollmentId(
    @Param('id', ParseUUIDPipe) enrollmentId: string,
  ): Promise<FollowUpExecution[]> {
    return this.followUpService.getExecutionsByEnrollmentId(enrollmentId);
  }
}
