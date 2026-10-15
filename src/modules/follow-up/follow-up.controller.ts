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
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FollowUpService } from './follow-up.service.js';
import {
  EnrollLeadDto,
  ExecuteFollowUpDto,
  QueryFollowUpExecutionDto,
  UpdateEnrollmentDto,
} from './dto/index.js';
import {
  ApiPaginatedResponse,
  PaginatedResponseDto,
} from '../../common/index.js';
import { FollowUpExecutionResponseDto } from '@/modules/follow-up/dto/follow-up-execution-response.dto';
import { LeadFollowUpEnrollmentResponseDto } from '@/modules/follow-up/dto/lead-follow-up-enrollment-response.dto';
import { FollowUpExecutionMapper } from './mappers/follow-up-execution.mapper.js';
import { LeadFollowUpEnrollmentMapper } from './mappers/lead-follow-up-enrollment.mapper.js';
import { ExecuteFollowUpResponseDto } from './dto/execute-follow-up-response.dto.js';

@ApiTags('Follow-ups')
@Controller('follow-ups')
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Post('enrollments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enroll a lead into a sequence',
    description:
      'Creates an enrollment for a lead in a sequence and schedules the first step.',
  })
  @ApiBody({ type: EnrollLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Lead successfully enrolled.',
    type: LeadFollowUpEnrollmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Lead or sequence missing, or sequence has no active steps.',
  })
  @ApiResponse({
    status: 409,
    description: 'Lead is already actively enrolled in this sequence.',
  })
  enrollLead(
    @Body() dto: EnrollLeadDto,
  ): Promise<LeadFollowUpEnrollmentResponseDto> {
    return this.followUpService.enrollLead(dto);
  }

  @Post('enrollments/:id/pause')
  @ApiOperation({
    summary: 'Pause an active enrollment',
    description: 'Pauses step execution for this enrollment until resumed.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to pause' })
  @ApiBody({ type: UpdateEnrollmentDto })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully paused.',
    type: LeadFollowUpEnrollmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot pause an enrollment that is not active.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  pauseEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEnrollmentDto,
  ): Promise<LeadFollowUpEnrollmentResponseDto> {
    return this.followUpService
      .pauseEnrollment(id, dto)
      .then((enrollment) =>
        LeadFollowUpEnrollmentMapper.toResponseDto(enrollment),
      );
  }

  @Post('enrollments/:id/resume')
  @ApiOperation({
    summary: 'Resume a paused enrollment',
    description:
      'Resumes execution of steps for a previously paused enrollment.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to resume' })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully resumed.',
    type: LeadFollowUpEnrollmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Only PAUSED enrollments can be resumed.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  resumeEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFollowUpEnrollmentResponseDto> {
    return this.followUpService
      .resumeEnrollment(id)
      .then((enrollment) =>
        LeadFollowUpEnrollmentMapper.toResponseDto(enrollment),
      );
  }

  @Post('enrollments/:id/cancel')
  @ApiOperation({
    summary: 'Cancel an active enrollment',
    description:
      'Cancels the enrollment and marks any pending execution steps as SKIPPED.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the enrollment to cancel' })
  @ApiBody({ type: UpdateEnrollmentDto, required: false })
  @ApiResponse({
    status: 200,
    description: 'Enrollment successfully cancelled.',
    type: LeadFollowUpEnrollmentResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel a completed enrollment.',
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found.' })
  cancelEnrollment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto?: UpdateEnrollmentDto,
  ): Promise<LeadFollowUpEnrollmentResponseDto> {
    return this.followUpService
      .cancelEnrollment(id, dto ?? {})
      .then((enrollment) =>
        LeadFollowUpEnrollmentMapper.toResponseDto(enrollment),
      );
  }

  @Post('executions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute a follow-up step',
    description: 'Executes a specific follow-up step for an enrollment.',
  })
  @ApiBody({ type: ExecuteFollowUpDto })
  @ApiResponse({
    status: 200,
    description: 'Follow-up execution result.',
    type: ExecuteFollowUpResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or missing required fields.',
  })
  @ApiResponse({
    status: 404,
    description: 'Enrollment or step not found.',
  })
  execute(
    @Body() dto: ExecuteFollowUpDto,
  ): Promise<ExecuteFollowUpResponseDto> {
    return this.followUpService.execute(dto).then((result) => ({
      execution: FollowUpExecutionMapper.toResponseDto(result.execution),
      status: result.status,
      retryCount: result.retryCount,
      message: result.message,
    }));
  }

  @Get('executions')
  @ApiOperation({
    summary: 'Get follow-up executions',
    description: 'Retrieves follow-up executions with optional filtering.',
  })
  @ApiQuery({
    name: 'enrollmentId',
    required: false,
    description: 'Filter by enrollment UUID',
  })
  @ApiQuery({
    name: 'stepId',
    required: false,
    description: 'Filter by step UUID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by execution status',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiPaginatedResponse(
    FollowUpExecutionResponseDto,
    'List of follow-up executions returned successfully.',
  )
  findExecutions(
    @Query() query: QueryFollowUpExecutionDto,
  ): Promise<PaginatedResponseDto<FollowUpExecutionResponseDto>> {
    return this.followUpService.findExecutions(query);
  }
}
