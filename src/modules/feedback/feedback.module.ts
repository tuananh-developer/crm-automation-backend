import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerFeedback } from './entities/customer-feedback.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { FeedbackService } from './feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerFeedback,
      CustomerTask,
      Customer,
      WorkflowRun,
      Notification,
    ]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService, N8nAuthGuard],
  exports: [FeedbackService],
})
export class FeedbackModule {}
