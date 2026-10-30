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
import { FeedbackService } from './feedback.service.js';
import {
  CreateCustomerTaskDto,
  CreateFeedbackDto,
  FeedbackCallbackDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

@ApiTags('Customer Feedback & Tasks')
@Controller()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post('feedback')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit customer feedback (T12-WF14 ingress)',
    description:
      'Validates customer reference, redacts sensitive text, stores feedback record in NEW status, and dispatches to n8n AI Feedback Agent.',
  })
  @ApiBody({ type: CreateFeedbackDto })
  @ApiResponse({
    status: 202,
    description: 'Feedback accepted for AI classification.',
  })
  async createFeedback(@Body() dto: CreateFeedbackDto) {
    return this.feedbackService.createFeedback(dto);
  }

  @Get('feedback/:feedbackId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get feedback detail and classification' })
  @ApiParam({ name: 'feedbackId', format: 'uuid' })
  async getFeedback(@Param('feedbackId', ParseUUIDPipe) feedbackId: string) {
    return this.feedbackService.getFeedback(feedbackId);
  }

  @Get('customers/:customerId/feedback')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all feedback for a specific customer' })
  @ApiParam({ name: 'customerId', format: 'uuid' })
  async getCustomerFeedback(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.feedbackService.getCustomerFeedback(customerId);
  }

  @Post('feedback/:feedbackId/callback')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal n8n callback for T12-WF14 classification',
  })
  @ApiParam({ name: 'feedbackId', format: 'uuid' })
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
