import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { SalesMeetingsService } from './sales-meetings.service.js';
import { SaveMeetingActionItemsDto } from './dto/index.js';

@ApiTags('Internal n8n — Conversation Summaries')
@Controller('internal/n8n/conversation-summaries')
@UseGuards(N8nAuthGuard)
export class InternalConversationSummariesController {
  constructor(private readonly service: SalesMeetingsService) {}
  @Post(':summaryId/action-items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Persist suggested action items as pending attendee confirmation',
  })
  save(
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
    @Body() dto: SaveMeetingActionItemsDto,
  ) {
    return this.service.saveActionItems(summaryId, dto);
  }
}
