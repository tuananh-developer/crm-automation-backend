import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { SegmentWorkflowCallbackDto } from './dto/segment-workflow-callback.dto.js';
import { SegmentsService } from './segments.service.js';

@ApiTags('Internal n8n Webhooks')
@Controller('internal/n8n/segments')
@UseGuards(N8nAuthGuard)
export class InternalSegmentsWorkflowController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post(':segmentId/workflow-runs')
  @ApiOperation({ summary: 'Create or retrieve an idempotent WF07 run' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  createWorkflowRun(
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.segmentsService.createWorkflowRun(segmentId, idempotencyKey);
  }

  @Post(':segmentId/workflow-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Persist a service-authenticated WF07 callback' })
  callback(
    @Param('segmentId', ParseUUIDPipe) segmentId: string,
    @Body() dto: SegmentWorkflowCallbackDto,
  ) {
    if (dto.segmentId !== segmentId) {
      throw new BadRequestException('Segment ID does not match callback body');
    }
    return this.segmentsService.handleWorkflowCallback(dto);
  }
}
