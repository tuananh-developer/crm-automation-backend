import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { User } from '../users/entities/user.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { SegmentsService } from './segments.service.js';
import { SegmentsController } from './segments.controller.js';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { InternalSegmentsWorkflowController } from './internal-segments-workflow.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Segment,
      CustomerSegment,
      LeadScore,
      User,
      WorkflowRun,
    ]),
    AuthModule,
  ],
  controllers: [
    SegmentsController,
    CustomersController,
    InternalSegmentsWorkflowController,
  ],
  providers: [SegmentsService, CustomersService, N8nAuthGuard],
  exports: [TypeOrmModule, SegmentsService, CustomersService],
})
export class CustomersModule {}
