import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { SalesMeetingsService } from './sales-meetings.service.js';
import { SaveConversationTranscriptDto } from './dto/index.js';

@ApiTags('Internal n8n — Conversation Transcripts')
@Controller('internal/n8n/conversation-transcripts')
@UseGuards(N8nAuthGuard)
export class InternalConversationTranscriptsController {
  constructor(private readonly service: SalesMeetingsService) {}
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Persist a server-redacted conversation transcript',
  })
  save(@Body() dto: SaveConversationTranscriptDto) {
    return this.service.saveTranscript(dto);
  }
}
