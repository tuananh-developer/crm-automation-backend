import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { DataCleaningService } from './data-cleaning.service.js';
import { NotifyDataCleaningReviewerDto } from './dto/notify-data-cleaning-reviewer.dto.js';

@ApiTags('Internal n8n — WF08 Data Cleaning')
@Controller('internal/n8n/data-cleaning')
@UseGuards(N8nAuthGuard)
export class InternalDataCleaningController {
  constructor(private readonly service: DataCleaningService) {}

  @Get('scans/:workflowRunId')
  @ApiOperation({ summary: 'Read the scoped scan context for WF08' })
  getScanContext(@Param('workflowRunId', ParseUUIDPipe) workflowRunId: string) {
    return this.service.getInternalScanContext(workflowRunId);
  }

  @Post('notify-reviewer')
  @ApiOperation({
    summary: 'Ensure the scan owner has one reviewer notification',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  notifyReviewer(
    @Body() body: NotifyDataCleaningReviewerDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || key !== body.idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header mismatch');
    }
    return this.service.ensureScanReviewerNotification(body.workflowRunId, key);
  }
}
