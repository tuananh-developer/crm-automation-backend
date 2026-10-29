import { Module } from '@nestjs/common';
import { CommunicationService } from './communication.service.js';
import { CommunicationController } from './communication.controller.js';

@Module({
  providers: [CommunicationService],
  controllers: [CommunicationController],
  exports: [CommunicationService],
})
export class CommunicationModule {}
