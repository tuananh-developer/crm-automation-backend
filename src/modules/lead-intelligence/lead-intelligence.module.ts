import { forwardRef, Module } from '@nestjs/common';
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
import { EnrichmentController } from './enrichment.controller.js';
import { ScoringController } from './scoring.controller.js';
import { InternalN8nController } from './internal-n8n.controller.js';
import { N8nAuthGuard } from './guards/n8n-auth.guard.js';
import { DataCleaningModule } from '../data-cleaning/data-cleaning.module.js';
import { AuthModule } from '../auth/auth.module.js';

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
    forwardRef(() => DataCleaningModule),
    AuthModule,
  ],
  controllers: [
    LeadIntelligenceController,
    EnrichmentController,
    ScoringController,
    InternalN8nController,
  ],
  providers: [LeadIntelligenceService, N8nAuthGuard],
  exports: [LeadIntelligenceService, TypeOrmModule],
})
export class LeadIntelligenceModule {}
