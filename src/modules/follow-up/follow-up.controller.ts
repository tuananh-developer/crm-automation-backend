import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { FollowUpService } from './follow-up.service.js';
import {
  CancelEnrollmentDto,
  CreateSequenceDto,
  CreateStepDto,
  EnrollLeadDto,
  UpdateSequenceDto,
  UpdateStepDto,
} from './dto/index.js';
import {
  EnrollmentStatus,
  FollowUpSequenceStatus,
} from './enums/follow-up.enum.js';

@Controller('follow-up')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  // ── Sequences Endpoints ───────────────────────────────────────────────────

  @Post('sequences')
  @HttpCode(HttpStatus.CREATED)
  createSequence(@Body() dto: CreateSequenceDto) {
    return this.followUpService.createSequence(dto);
  }

  @Get('sequences')
  findAllSequences(@Query('status') status?: FollowUpSequenceStatus) {
    return this.followUpService.findAllSequences(status);
  }

  @Get('sequences/:id')
  findSequenceById(@Param('id', ParseUUIDPipe) id: string) {
    return this.followUpService.findSequenceById(id);
  }

  @Patch('sequences/:id')
  updateSequence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSequenceDto,
  ) {
    return this.followUpService.updateSequence(id, dto);
  }

  // ── Steps Endpoints ───────────────────────────────────────────────────────

  @Post('sequences/:sequenceId/steps')
  @HttpCode(HttpStatus.CREATED)
  createStep(
    @Param('sequenceId', ParseUUIDPipe) sequenceId: string,
    @Body() dto: CreateStepDto,
  ) {
    return this.followUpService.createStep(sequenceId, dto);
  }

  @Get('sequences/:sequenceId/steps')
  findStepsBySequence(@Param('sequenceId', ParseUUIDPipe) sequenceId: string) {
    return this.followUpService.findStepsBySequence(sequenceId);
  }

  @Patch('steps/:stepId')
  updateStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.followUpService.updateStep(stepId, dto);
  }

  // ── Enrollments Endpoints (UC05) ──────────────────────────────────────────

  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  enrollLead(@Body() dto: EnrollLeadDto) {
    return this.followUpService.enrollLead(dto);
  }

  @Post('enrollments')
  @HttpCode(HttpStatus.CREATED)
  enrollLeadAlias(@Body() dto: EnrollLeadDto) {
    return this.followUpService.enrollLead(dto);
  }

  @Get('enrollments')
  findAllEnrollments(
    @Query('leadId') leadId?: string,
    @Query('sequenceId') sequenceId?: string,
    @Query('status') status?: EnrollmentStatus,
  ) {
    return this.followUpService.findAllEnrollments({
      leadId,
      sequenceId,
      status,
    });
  }

  @Get('enrollments/:id')
  findEnrollmentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.followUpService.findEnrollmentById(id);
  }

  @Patch('enrollments/:id/cancel')
  cancelEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: CancelEnrollmentDto,
  ) {
    return this.followUpService.cancelEnrollment(id, dto);
  }

  @Get('leads/:leadId/enrollments')
  findEnrollmentsByLead(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.followUpService.findEnrollmentsByLead(leadId);
  }
}
