import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { N8nModule } from '../../infrastructure/n8n/n8n.module.js';
import { SequencesController } from './sequences.controller.js';
import { SequencesService } from './sequences.service.js';
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
      User,
      Interaction,
      Customer,
      AuditLog,
    ]),
    N8nModule,
  ],
  controllers: [SequencesController, FollowUpController],
  providers: [SequencesService, FollowUpService],
  exports: [SequencesService, FollowUpService, TypeOrmModule],
})
export class FollowUpModule {}
