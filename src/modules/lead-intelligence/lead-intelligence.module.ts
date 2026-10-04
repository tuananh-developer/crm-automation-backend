import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadQualification } from './entities/lead-qualification.entity.js';
import { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import { LeadScore } from './entities/lead-score.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { WorkflowRun } from '../workflow/entities/workflow-run.entity.js';
import { ReviewTask } from '../review/entities/review-task.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { LeadIntelligenceService } from './lead-intelligence.service.js';
import { LeadIntelligenceController } from './lead-intelligence.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LeadQualification,
      LeadEnrichment,
      LeadScore,
      Lead,
      Interaction,
      WorkflowRun,
      ReviewTask,
      Notification,
    ]),
  ],
  controllers: [LeadIntelligenceController],
  providers: [LeadIntelligenceService],
  exports: [LeadIntelligenceService, TypeOrmModule],
})
export class LeadIntelligenceModule {}
