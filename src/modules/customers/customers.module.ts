import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { LeadScore } from '../lead-intelligence/entities/lead-score.entity.js';
import { User } from '../users/entities/user.entity.js';
import { SegmentsService } from './segments.service.js';
import { SegmentsController } from './segments.controller.js';
import { CustomersService } from './customers.service.js';
import { AccountHealthService } from './account-health.service.js';
import { AccountHealthController } from './account-health.controller.js';
import {
  CustomerTasksController,
  CustomersController,
} from './customers.controller.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { AccountHealthSnapshot } from './entities/account-health-snapshot.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Segment,
      CustomerSegment,
      LeadScore,
      User,
      WorkflowRun,
      CustomerChurnAssessment,
      CustomerTask,
      AccountHealthSnapshot,
    ]),
  ],
  controllers: [
    AccountHealthController,
    SegmentsController,
    CustomersController,
    CustomerTasksController,
  ],
  providers: [SegmentsService, CustomersService, AccountHealthService],
  exports: [TypeOrmModule, SegmentsService, CustomersService],
})
export class CustomersModule {}
