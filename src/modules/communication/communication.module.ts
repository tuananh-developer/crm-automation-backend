import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service.js';
import { InternalCommunicationController } from './internal-communication.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationDelivery } from './entities/communication-delivery.entity.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([CommunicationDelivery])],
  providers: [CommunicationService, N8nAuthGuard],
  controllers: [InternalCommunicationController],
  exports: [CommunicationService],
})
export class CommunicationModule {}
