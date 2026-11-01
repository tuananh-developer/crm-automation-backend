import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User, Lead])],
  controllers: [NotificationsController],
  providers: [NotificationsService, N8nAuthGuard],
  exports: [NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
