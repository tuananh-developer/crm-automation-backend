import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerFeedback } from './entities/customer-feedback.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { OutboxEvent } from '../../infrastructure/rabbitmq/entities/outbox-event.entity.js';
import { FeedbackService } from './feedback.service.js';
import { FeedbackController } from './feedback.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { FeedbackReadAuthGuard } from './guards/feedback-read-auth.guard.js';
import { N8nWorkflowDispatchService } from '../t12-workflows/n8n-workflow-dispatch.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerFeedback,
      CustomerTask,
      Customer,
      WorkflowRun,
      Notification,
      OutboxEvent,
    ]),
  ],
  controllers: [FeedbackController],
  providers: [
    FeedbackService,
    JwtAuthGuard,
    N8nAuthGuard,
    FeedbackReadAuthGuard,
    N8nWorkflowDispatchService,
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
