import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadQualification } from './entities/lead-qualification.entity.js';
import { LeadEnrichment } from './entities/lead-enrichment.entity.js';
import { LeadScore } from './entities/lead-score.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([LeadQualification, LeadEnrichment, LeadScore]),
  ],
  exports: [TypeOrmModule],
})
export class LeadIntelligenceModule {}
