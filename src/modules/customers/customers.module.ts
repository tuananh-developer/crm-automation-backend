import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
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
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Segment,
      CustomerSegment,
      Lead,
      Interaction,
      LeadQualification,
      LeadEnrichment,
      LeadScore,
      WorkflowRun,
      LeadFollowUpEnrollment,
      FollowUpExecution,
      User,
    ]),
  ],
  controllers: [SegmentsController, CustomersController],
  providers: [SegmentsService, CustomersService, N8nAuthGuard],
  exports: [TypeOrmModule, SegmentsService, CustomersService],
})
export class CustomersModule {}
