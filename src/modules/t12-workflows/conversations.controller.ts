import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  NotifyTranscriptDto,
  SaveInternalActionItemsDto,
  UpdateActionItemDto,
  UpdateInternalRedactedContentDto,
} from './dto/index.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

@ApiTags('Conversations & Meetings (T12-WF09)')
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
      'Validates entity permissions, redacts transcript text, stores ConversationTranscript, initiates WorkflowRun and dispatches to n8n.',
  })
  @ApiBody({ type: CreateTranscriptDto })
  @ApiResponse({
    status: 202,
    description: 'Transcript accepted for AI summarization.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Missing required meetingId or caller-supplied sourceEventId/idempotencyKey, or invalid transcript payload.',
  })
  async createTranscript(
    @Body() dto: CreateTranscriptDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') headerIdempotencyKey?: string,
  ) {
    return this.conversationsService.createTranscript(
      dto,
      user,
      headerIdempotencyKey,
    );
  }

  @Get('conversation-transcripts/:transcriptId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get transcript detail and status' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async getTranscript(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.getTranscript(transcriptId, user);
  }

  @Get('conversation-transcripts/:transcriptId/summary')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get AI generated summary and action items' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async getTranscriptSummary(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.getTranscriptSummary(transcriptId, user);
  }

  @Put([
    'conversation-transcripts/:transcriptId/internal/redact',
    'internal/n8n/conversation-transcripts/:transcriptId/redact',
  ])
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary:
      'Internal endpoint for workflow to save normalized redacted transcript',
  })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async saveRedactedTranscript(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @Body() dto: UpdateInternalRedactedContentDto,
  ) {
    return this.conversationsService.updateInternalRedactedContent(
      transcriptId,
      dto,
    );
  }

  @Post([
    'conversation-transcripts/:transcriptId/callback',
    'internal/n8n/conversation-transcripts/:transcriptId/callback',
  ])
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({ summary: 'Internal n8n callback for T12-WF09' })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  @ApiResponse({
    status: 409,
    description:
      'Conflict: WorkflowRun already in terminal state or conflicting callback payload.',
  })
  async handleCallback(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @Body() dto: ConversationCallbackDto,
  ) {
    dto.transcriptId = transcriptId;
    return this.conversationsService.handleCallback(dto);
  }

  @Post('conversation-summaries/:summaryId/internal/action-items')
  @Public()
  @UseGuards(N8nAuthGuard)
  @ApiOperation({
    summary: 'Internal endpoint for workflow to persist pending action items',
  })
  @ApiParam({ name: 'summaryId', format: 'uuid' })
  async savePendingActionItems(
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
    @Body() dto: SaveInternalActionItemsDto,
  ) {
    return this.conversationsService.saveInternalActionItems(summaryId, dto);
  }

  @Post('internal/n8n/conversation-transcripts/:transcriptId/action-items')
  @Public()
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Internal WF09 endpoint to persist pending action items for a completed transcript',
  })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async saveTranscriptActionItems(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @Body() dto: SaveInternalActionItemsDto,
  ) {
    return this.conversationsService.saveTranscriptActionItems(
      transcriptId,
      dto,
    );
  }

  @Post('internal/n8n/conversation-transcripts/:transcriptId/notify')
  @Public()
  @UseGuards(N8nAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Idempotent internal WF09 endpoint to ensure owner notification only on SUCCESS runs',
  })
  @ApiParam({ name: 'transcriptId', format: 'uuid' })
  async notifyOwnerInternal(
    @Param('transcriptId', ParseUUIDPipe) transcriptId: string,
    @Body() dto: NotifyTranscriptDto,
  ) {
    return this.conversationsService.notifyOwnerInternal(
      transcriptId,
      dto.workflowRunId,
    );
  }

  @Get('conversation-summaries/:summaryId/action-items')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List action items for a conversation summary' })
  @ApiParam({ name: 'summaryId', format: 'uuid' })
  async getActionItems(
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.getActionItems(summaryId, user);
  }

  @Patch('conversation-action-items/:itemId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update status or approval of an action item' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  async updateActionItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateActionItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.conversationsService.updateActionItem(itemId, dto, user);
  }
}
