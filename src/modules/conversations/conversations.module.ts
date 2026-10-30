import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import { ConversationActionItem } from './entities/conversation-action-item.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationsController } from './conversations.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationTranscript,
      ConversationSummary,
      ConversationActionItem,
      WorkflowRun,
      Notification,
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, N8nAuthGuard],
  exports: [ConversationsService],
})
export class ConversationsModule {}
