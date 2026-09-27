import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUpSequence } from './entities/follow-up-sequence.entity.js';
import { FollowUpStep } from './entities/follow-up-step.entity.js';
import { LeadFollowUpEnrollment } from './entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from './entities/follow-up-execution.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FollowUpSequence,
      FollowUpStep,
      LeadFollowUpEnrollment,
      FollowUpExecution,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class FollowUpModule {}
