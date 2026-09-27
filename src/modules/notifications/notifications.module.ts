import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  exports: [TypeOrmModule],
})
export class NotificationsModule {}
