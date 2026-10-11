import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewTask } from './entities/review-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReviewTask,
      Lead,
      User,
      WorkflowRun,
      Notification,
      AuditLog,
    ]),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService, TypeOrmModule],
})
export class ReviewModule {}
