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
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service.js';
import {
  CreateCustomerTaskDto,
  CreateFeedbackDto,
  FeedbackCallbackDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { FeedbackReadAuthGuard } from './guards/feedback-read-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

@ApiTags('Customer Feedback & Tasks')
@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('feedback')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit customer feedback (T12-WF14 ingress)',
    description:
      'Validates customer tenant ownership, redacts sensitive text, stores feedback record in NEW status, and dispatches to n8n AI Feedback Agent.',
  })
  @ApiBody({ type: CreateFeedbackDto })
  @ApiResponse({
    status: 202,
    description: 'Feedback accepted for AI classification.',
  })
  async createFeedback(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedbackService.createFeedback(dto, user);
  }

  @Get('feedback/:feedbackId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get feedback detail and classification' })
  @ApiParam({ name: 'feedbackId', format: 'uuid' })
  async getFeedback(
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.feedbackService.getFeedback(feedbackId, user);
  }

  @Get('feedback/:feedbackId/internal')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal get feedback detail for n8n workflows/services',
  })
  @ApiParam({ name: 'feedbackId', format: 'uuid' })
  async getInternalFeedback(
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
  ) {
    return this.feedbackService.getInternalFeedback(feedbackId);
  }

  /**
   * Canonical route for retrieving customer feedback history.
   * Accepts both browser JWT callers (scoped by tenant/owner) and internal n8n
   * workflow calls (such as WF05 Customer 360) authenticated via X-N8N-API-KEY.
   */
  @Get('customers/:customerId/feedback')
  @UseGuards(FeedbackReadAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all feedback for a specific customer' })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  async getCustomerFeedback(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.feedbackService.getCustomerFeedback(customerId, user);
  }

  @Get('customers/:customerId/feedback/internal')
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal list of customer feedback for n8n workflows (e.g. WF05)',
  })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  async getInternalCustomerFeedback(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.feedbackService.getInternalCustomerFeedback(customerId);
  }

  @Post('feedback/:feedbackId/callback')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal n8n callback for T12-WF14 classification',
  })
  @ApiParam({ name: 'feedbackId', format: 'uuid' })
  @ApiResponse({
    status: 409,
    description:
      'Conflict: WorkflowRun already in terminal state or conflicting callback payload.',
  })
  async handleCallback(
    @Param('feedbackId', ParseUUIDPipe) feedbackId: string,
    @Body() dto: FeedbackCallbackDto,
  ) {
    dto.feedbackId = feedbackId;
    return this.feedbackService.handleCallback(dto);
  }

  @Post('customer-tasks')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Create or ensure operational CustomerTask (idempotent)',
    description:
      'Creates an operational CustomerTask or returns the existing task if idempotencyKey matches.',
  })
  @ApiBody({ type: CreateCustomerTaskDto })
  async ensureCustomerTask(@Body() dto: CreateCustomerTaskDto) {
    return this.feedbackService.ensureCustomerTask(dto);
  }
}
