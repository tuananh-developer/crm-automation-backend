import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service.js';
import { InternalCommunicationController } from './internal-communication.controller.js';

@Module({
  providers: [CommunicationService],
  controllers: [InternalCommunicationController],
  exports: [CommunicationService],
})
export class CommunicationModule {}
