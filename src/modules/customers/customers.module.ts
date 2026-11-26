import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { CustomerFeedback } from '../feedback/entities/customer-feedback.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { LeadQualification } from '../lead-intelligence/entities/lead-qualification.entity.js';
import { LeadEnrichment } from '../lead-intelligence/entities/lead-enrichment.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { User } from '../users/entities/user.entity.js';
import { SegmentsService } from './segments.service.js';
import { SegmentsController } from './segments.controller.js';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';
import { AccountHealthService } from './account-health.service.js';
import { AccountHealthController } from './account-health.controller.js';
import { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import {
  InternalChurnController,
  InternalCustomerTasksController,
} from './internal-churn.controller.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { InternalSegmentsWorkflowController } from './internal-segments-workflow.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtOrN8nAuthGuard } from '../../common/guards/jwt-or-n8n-auth.guard.js';
import { N8nWorkflowDispatchService } from '../t12-workflows/n8n-workflow-dispatch.service.js';
import { WorkflowExecutionClaimsService } from '../t12-workflows/workflow-execution-claims.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      CustomerTask,
      CustomerFeedback,
      Segment,
      CustomerSegment,
      Lead,
      Interaction,
      LeadQualification,
      LeadEnrichment,
      LeadScore,
      LeadFollowUpEnrollment,
      FollowUpExecution,
      User,
      WorkflowRun,
      AccountHealthSnapshot,
      CustomerChurnAssessment,
    ]),
    AuthModule,
  ],
  controllers: [
    AccountHealthController,
    SegmentsController,
    CustomersController,
    InternalChurnController,
    InternalCustomerTasksController,
    InternalSegmentsWorkflowController,
  ],
  providers: [
    SegmentsService,
    CustomersService,
    AccountHealthService,
    N8nWorkflowDispatchService,
    WorkflowExecutionClaimsService,
    N8nAuthGuard,
    JwtOrN8nAuthGuard,
  ],
  exports: [
    TypeOrmModule,
    SegmentsService,
    CustomersService,
    AccountHealthService,
    JwtOrN8nAuthGuard,
  ],
})
export class CustomersModule {}
