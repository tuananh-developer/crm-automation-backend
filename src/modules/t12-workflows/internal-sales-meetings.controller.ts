import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { SalesMeetingsService } from './sales-meetings.service.js';
import { NotifyMeetingDto, SaveMeetingSummaryDto } from './dto/index.js';

@ApiTags('Internal n8n — WF11 Sales Meeting')
@Controller('internal/n8n/sales-meetings')
@UseGuards(N8nAuthGuard)
export class InternalSalesMeetingsController {
  constructor(private readonly service: SalesMeetingsService) {}

  @Get(':meetingId/context')
  @ApiOperation({ summary: 'Read meeting and attendee CRM context' })
  getContext(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Query('n8nExecutionId') n8nExecutionId?: string,
  ) {
    return this.service.getContext(meetingId, n8nExecutionId);
  }

  @Post(':meetingId/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Persist AI-generated meeting summary after transcript validation',
  })
  saveSummary(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: SaveMeetingSummaryDto,
  ) {
    return this.service.saveSummary(meetingId, dto);
  }

  @Post('notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Idempotently notify meeting owner and attendees' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  notify(
    @Body() dto: NotifyMeetingDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (key !== dto.idempotencyKey)
      throw new BadRequestException('Idempotency-Key header mismatch');
    return this.service.notify(dto);
  }
}
