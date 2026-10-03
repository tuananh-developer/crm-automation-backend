import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { N8nModule } from '../../infrastructure/n8n/n8n.module.js';
import { FollowUpController } from './follow-up.controller.js';
import { FollowUpService } from './follow-up.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUpSequence,
      FollowUpStep,
      LeadFollowUpEnrollment,
      FollowUpExecution,
      Lead,
      Customer,
      AuditLog,
    ]),
    N8nModule,
  ],
  controllers: [FollowUpController],
  providers: [FollowUpService],
  exports: [FollowUpService, TypeOrmModule],
})
export class FollowUpModule {}
