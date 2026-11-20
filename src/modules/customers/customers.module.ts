import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { CustomerFeedback } from '../feedback/entities/customer-feedback.entity.js';
import { User } from '../users/entities/user.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { SegmentsService } from './segments.service.js';
import { SegmentsController } from './segments.controller.js';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';
import { AccountHealthService } from './account-health.service.js';
import { AccountHealthController } from './account-health.controller.js';
import { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { InternalSegmentsWorkflowController } from './internal-segments-workflow.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerTask,
      Segment,
      CustomerSegment,
      LeadScore,
      Lead,
      Interaction,
      LeadFollowUpEnrollment,
      FollowUpExecution,
      CustomerFeedback,
      User,
      WorkflowRun,
      AccountHealthSnapshot,
    ]),
    AuthModule,
  ],
  controllers: [
    AccountHealthController,
    SegmentsController,
    CustomersController,
    InternalSegmentsWorkflowController,
  ],
  providers: [
    SegmentsService,
    CustomersService,
    AccountHealthService,
    N8nAuthGuard,
  ],
  exports: [
    TypeOrmModule,
    SegmentsService,
    CustomersService,
    AccountHealthService,
  ],
})
export class CustomersModule {}
