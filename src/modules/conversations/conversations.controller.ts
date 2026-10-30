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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationCallbackDto,
  CreateTranscriptDto,
  UpdateActionItemDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

@ApiTags('Conversations & Meetings')
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post('conversation-transcripts')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Ingest conversation transcript and trigger AI Summarizer (T12-WF09)',
    description:
      'Validates and redacts transcript text, stores ConversationTranscript, initiates WorkflowRun and dispatches to n8n.',
  })
  @ApiBody({ type: CreateTranscriptDto })
  @ApiResponse({
    status: 202,
    description: 'Transcript accepted for AI summarization.',
  })
  async createTranscript(
    @Body() dto: CreateTranscriptDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.conversationsService.createTranscript(dto, user?.id);
  }

  @Get('conversation-transcripts/:transcriptId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transcript detail and status' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async getTranscript(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
  ) {
    return this.conversationsService.getTranscript(transcriptId);
  }

  @Get('conversation-transcripts/:transcriptId/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get AI generated summary and action items' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async getTranscriptSummary(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
  ) {
    return this.conversationsService.getTranscriptSummary(transcriptId);
  }

  @Post('conversation-transcripts/:transcriptId/callback')
  @UseGuards(N8nAuthGuard)
  @ApiOperation({ summary: 'Internal n8n callback for T12-WF09' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async handleCallback(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @Body() dto: ConversationCallbackDto,
  ) {
    dto.transcriptId = transcriptId;
    return this.conversationsService.handleCallback(dto);
  }

  @Get('conversation-summaries/:summaryId/action-items')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List action items for a conversation summary' })
  @ApiParam({ name: 'summaryId', format: 'uuid' })
  async getActionItems(@Param('summaryId', ParseUUIDPipe) summaryId: string) {
    return this.conversationsService.getActionItems(summaryId);
  }

  @Patch('conversation-action-items/:itemId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update status or approval of an action item' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  async updateActionItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateActionItemDto,
  ) {
    return this.conversationsService.updateActionItem(itemId, dto);
  }
}
