import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Lead } from '../leads/entities/lead.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RabbitMQModule } from '../../infrastructure/rabbitmq/rabbitmq.module.js';
import { DataCleaningService } from './data-cleaning.service.js';
import { DataCleaningController } from './data-cleaning.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, WorkflowRun, AuditLog]),
    RabbitMQModule,
    ConfigModule,
    AuthModule,
  ],
  controllers: [DataCleaningController],
  providers: [DataCleaningService, N8nAuthGuard],
  exports: [DataCleaningService],
})
export class DataCleaningModule {}
