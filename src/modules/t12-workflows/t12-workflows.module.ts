import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { CustomerSegment } from '../customers/entities/customer-segment.entity.js';
import { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { N8nWorkflowDispatchService } from './n8n-workflow-dispatch.service.js';
import { NextBestActionRecommendation } from './entities/next-best-action-recommendation.entity.js';
import { SalesMeeting } from './entities/sales-meeting.entity.js';
import { ConversationTranscript } from './entities/conversation-transcript.entity.js';
import { ConversationSummary } from './entities/conversation-summary.entity.js';
import { ConversationActionItem } from './entities/conversation-action-item.entity.js';
import { ProductCatalogItem } from './entities/product-catalog-item.entity.js';
import { Quote } from './entities/quote.entity.js';
import { QuoteItem } from './entities/quote-item.entity.js';
import { QuoteApproval } from './entities/quote-approval.entity.js';
import { NextBestActionsService } from './next-best-actions.service.js';
import { SalesMeetingsService } from './sales-meetings.service.js';
import { QuotesService } from './quotes.service.js';
import { ConversationsService } from './conversations.service.js';
import { ConversationsController } from './conversations.controller.js';
import { NextBestActionsController } from './next-best-actions.controller.js';
import { InternalNextBestActionsController } from './internal-next-best-actions.controller.js';
import { SalesMeetingsController } from './sales-meetings.controller.js';
import { InternalSalesMeetingsController } from './internal-sales-meetings.controller.js';
import { InternalConversationTranscriptsController } from './internal-conversation-transcripts.controller.js';
import { InternalConversationSummariesController } from './internal-conversation-summaries.controller.js';
import { QuotesController } from './quotes.controller.js';
import { InternalQuotesController } from './internal-quotes.controller.js';
import { InternalCatalogController } from './internal-catalog.controller.js';
import { InternalWorkflowExecutionClaimsController } from './internal-workflow-execution-claims.controller.js';
import { WorkflowExecutionClaimsService } from './workflow-execution-claims.service.js';

const ENTITIES = [
  WorkflowRun,
  Lead,
  Customer,
  Interaction,
  LeadQualification,
  LeadScore,
  LeadFollowUpEnrollment,
  CustomerSegment,
  ReviewTask,
  Notification,
  User,
  NextBestActionRecommendation,
  SalesMeeting,
  ConversationTranscript,
  ConversationSummary,
  ConversationActionItem,
  ProductCatalogItem,
  Quote,
  QuoteItem,
  QuoteApproval,
];

@Module({
  imports: [TypeOrmModule.forFeature(ENTITIES), AuthModule],
  controllers: [
    ConversationsController,
    NextBestActionsController,
    InternalNextBestActionsController,
    SalesMeetingsController,
    InternalSalesMeetingsController,
    InternalConversationTranscriptsController,
    InternalConversationSummariesController,
    QuotesController,
    InternalQuotesController,
    InternalCatalogController,
    InternalWorkflowExecutionClaimsController,
  ],
  providers: [
    N8nAuthGuard,
    N8nWorkflowDispatchService,
    ConversationsService,
    NextBestActionsService,
    SalesMeetingsService,
    QuotesService,
    WorkflowExecutionClaimsService,
  ],
  exports: [
    ConversationsService,
    NextBestActionsService,
    SalesMeetingsService,
    QuotesService,
    TypeOrmModule,
  ],
})
export class T12WorkflowsModule {}
