import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SequencesService } from './sequences.service.js';
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

@ApiTags('Follow-up Sequences')
@Controller(['follow-up', 'sequences'])
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  // ── Sequence CRUD Endpoints ────────────────────────────────────────────────

  @Post(['sequences', ''])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new follow-up sequence (UC05)',
    description:
      'Creates a new sequence for automated outreach (e.g. Email / Call / Task cadence).',
  })
  @ApiBody({ type: CreateSequenceDto })
  @ApiResponse({
    status: 201,
    description: 'Sequence successfully created.',
  })
  @ApiResponse({
    status: 409,
    description: 'Sequence with this name already exists.',
  })
  createSequence(@Body() dto: CreateSequenceDto) {
    return this.sequencesService.createSequence(dto);
  }

  @Get(['sequences', ''])
  @ApiOperation({
    summary: 'List all follow-up sequences',
    description: 'Retrieves all sequences, optionally filtered by status.',
  })
  @ApiQuery({
    name: 'status',
    enum: FollowUpSequenceStatus,
    required: false,
    description: 'Filter sequences by status (ACTIVE, INACTIVE, ARCHIVED)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of sequences returned successfully.',
  })
  findAllSequences(@Query('status') status?: FollowUpSequenceStatus) {
    return this.sequencesService.findAllSequences(status);
  }

  // ── Enrollment Management Endpoints ────────────────────────────────────────

  @Get('enrollments')
  @ApiOperation({
    summary: 'List all lead follow-up enrollments',
    description:
      'Retrieves all enrollments, optionally filtered by leadId, sequenceId, or status.',
  })
  @ApiQuery({
    name: 'leadId',
    required: false,
    description: 'Filter by lead UUID',
  })
  @ApiQuery({
    name: 'sequenceId',
    required: false,
    description: 'Filter by sequence UUID',
  })
  @ApiQuery({
    name: 'status',
    enum: EnrollmentStatus,
    required: false,
    description:
      'Filter by enrollment status (ACTIVE, PAUSED, COMPLETED, CANCELLED)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of enrollments returned successfully.',
  })
  findAllEnrollments(
    @Query('leadId') leadId?: string,
    @Query('sequenceId') sequenceId?: string,
    @Query('status') status?: EnrollmentStatus,
  ) {
    return this.sequencesService.findAllEnrollments({
      leadId,
      sequenceId,
      status,
    });
  }

  @Get(['leads/:leadId/enrollments', 'enrollments/lead/:leadId'])
  @ApiOperation({
    summary: 'Get all enrollments for a specific lead',
    description: 'Retrieves the enrollment history of a lead by lead UUID.',
  })
  @ApiParam({ name: 'leadId', description: 'UUID of the lead' })
  @ApiResponse({
    status: 200,
    description: 'List of lead enrollments returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Lead not found.' })
  findEnrollmentsByLead(@Param('leadId', ParseUUIDPipe) leadId: string) {
    return this.sequencesService.findEnrollmentsByLead(leadId);
  }

  @Get('enrollments/:id')
  @ApiOperation({
    summary: 'Get enrollment details by ID',
    description:
      'Retrieves full details of an enrollment including steps and executions.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment details returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  findEnrollmentById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.findEnrollmentById(id);
  }

  @Patch('enrollments/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an active enrollment',
    description:
      'Cancels the enrollment and marks any pending execution steps as SKIPPED.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to cancel' })
  @ApiBody({ type: CancelEnrollmentDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully cancelled.',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel a completed enrollment.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  cancelEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: CancelEnrollmentDto,
  ) {
    return this.sequencesService.cancelEnrollment(id, dto);
  }

  @Patch('enrollments/:id/pause')
  @ApiOperation({
    summary: 'Pause an active enrollment',
    description: 'Pauses step execution for this enrollment until resumed.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to pause' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully paused.',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot pause an enrollment that is not active.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  pauseEnrollment(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.pauseEnrollment(id);
  }

  @Patch('enrollments/:id/resume')
  @ApiOperation({
    summary: 'Resume a paused enrollment',
    description:
      'Resumes execution of steps for a previously paused enrollment.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to resume' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully resumed.',
  })
  @ApiResponse({
    status: 400,
    description: 'Only PAUSED enrollments can be resumed.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  resumeEnrollment(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.resumeEnrollment(id);
  }

  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a lead into a sequence (direct endpoint)',
    description:
      'Enrolls a lead into a specified sequence, schedules the first step, logs an interaction note, and triggers RabbitMQ event.',
  })
  @ApiBody({ type: EnrollLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Lead successfully enrolled into sequence.',
  })
  @ApiResponse({
    status: 400,
    description: 'Lead or sequence missing, or sequence has no active steps.',
  })
  @ApiResponse({
    status: 409,
    description: 'Lead is already actively enrolled in this sequence.',
  })
  enrollLeadDirect(@Body() dto: EnrollLeadDto) {
    return this.sequencesService.enrollLead(dto);
  }

  // ── Sequence By ID & Steps Endpoints ────────────────────────────────────────

  @Get(['sequences/:id', ':id'])
  @ApiOperation({
    summary: 'Get sequence details by ID',
    description: 'Retrieves a single sequence with its configured steps.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the sequence' })
  @ApiResponse({
    status: 200,
    description: 'Sequence details returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Sequence not found.' })
  findSequenceById(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.findSequenceById(id);
  }

  @Patch(['sequences/:id', ':id'])
  @ApiOperation({
    summary: 'Update sequence metadata',
    description: 'Updates sequence name, description, status, or active flag.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the sequence to update' })
  @ApiBody({ type: UpdateSequenceDto })
  @ApiResponse({
    status: 200,
    description: 'Sequence updated successfully.',
  })
  @ApiResponse({ status: 404, description: 'Sequence not found.' })
  updateSequence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSequenceDto,
  ) {
    return this.sequencesService.updateSequence(id, dto);
  }

  @Delete(['sequences/:id', ':id'])
  @ApiOperation({
    summary: 'Archive/Delete a sequence',
    description: 'Archives a sequence by transitioning its status to ARCHIVED.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the sequence to archive' })
  @ApiResponse({
    status: 200,
    description: 'Sequence archived successfully.',
  })
  @ApiResponse({ status: 404, description: 'Sequence not found.' })
  deleteSequence(@Param('id', ParseUUIDPipe) id: string) {
    return this.sequencesService.updateSequence(id, {
      status: FollowUpSequenceStatus.ARCHIVED,
      isActive: false,
    });
  }

  @Post(['sequences/:id/steps', ':id/steps'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a new step to a sequence',
    description:
      'Creates a new step (e.g. EMAIL, CALL, TASK) with delayMinutes and template content.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the parent sequence' })
  @ApiBody({ type: CreateStepDto })
  @ApiResponse({
    status: 201,
    description: 'Step created successfully.',
  })
  @ApiResponse({ status: 404, description: 'Parent sequence not found.' })
  createStep(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: CreateStepDto,
  ) {
    return this.sequencesService.createStep(sequenceId, dto);
  }

  @Get(['sequences/:id/steps', ':id/steps'])
  @ApiOperation({
    summary: 'List all steps of a sequence',
    description: 'Retrieves all ordered steps for the given sequence.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the sequence' })
  @ApiResponse({
    status: 200,
    description: 'List of steps returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Sequence not found.' })
  findStepsBySequence(@Param('id', ParseUUIDPipe) sequenceId: string) {
    return this.sequencesService.findStepsBySequence(sequenceId);
  }

  @Patch(['sequences/:sequenceId/steps/:stepId', ':sequenceId/steps/:stepId'])
  @ApiOperation({
    summary: 'Update a step within a sequence',
    description:
      'Updates step order, channel, delay, templates, or active flag.',
  })
  @ApiParam({ name: 'sequenceId', description: 'UUID of the parent sequence' })
  @ApiParam({ name: 'stepId', description: 'UUID of the step to update' })
  @ApiBody({ type: UpdateStepDto })
  @ApiResponse({
    status: 200,
    description: 'Step updated successfully.',
  })
  @ApiResponse({ status: 404, description: 'Step not found.' })
  updateStep(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.sequencesService.updateStep(stepId, dto);
  }

  @Patch(['steps/:stepId', 'sequences/steps/:stepId'])
  @ApiOperation({
    summary: 'Update a step directly by ID',
    description: 'Direct step update without specifying sequenceId in path.',
  })
  @ApiParam({ name: 'stepId', description: 'UUID of the step' })
  @ApiBody({ type: UpdateStepDto })
  @ApiResponse({
    status: 200,
    description: 'Step updated successfully.',
  })
  @ApiResponse({ status: 404, description: 'Step not found.' })
  updateStepDirect(
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body() dto: UpdateStepDto,
  ) {
    return this.sequencesService.updateStep(stepId, dto);
  }

  @Post(['sequences/:id/enroll', ':id/enroll'])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a lead into this sequence (UC05)',
    description:
      'Creates an active enrollment for the lead in this sequence, schedules execution, and logs interaction.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the sequence' })
  @ApiBody({ type: EnrollLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Lead successfully enrolled.',
  })
  @ApiResponse({
    status: 400,
    description: 'Lead not found or sequence has no active steps.',
  })
  @ApiResponse({
    status: 409,
    description: 'Lead already actively enrolled in this sequence.',
  })
  enrollLead(
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: EnrollLeadDto,
  ) {
    return this.sequencesService.enrollLead({
      ...dto,
      sequenceId,
    });
  }
}
