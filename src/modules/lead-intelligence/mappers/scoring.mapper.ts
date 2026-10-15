import type { LeadScore } from '../entities/lead-score.entity.js';
import type { ScoreLabel } from '../enums/lead-intelligence.enum.js';
import type { LeadQualification } from '../entities/lead-qualification.entity.js';
import type { LeadEnrichment } from '../entities/lead-enrichment.entity.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { Interaction } from '../../leads/entities/interaction.entity.js';
import {
  ScoringCallbackResponseDto,
  ScoringContextResponseDto,
  ScoringResponseDto,
} from '../dto/scoring-response.dto.js';
import { QualificationMapper } from './qualification.mapper.js';
import { EnrichmentMapper } from './enrichment.mapper.js';

export class ScoringMapper {
  static toResponseDto(
    entity: LeadScore | Record<string, unknown>,
  ): ScoringResponseDto {
    const rec = entity as Record<string, unknown>;
    const scoringFeatures =
      rec.scoringFeatures && typeof rec.scoringFeatures === 'object'
        ? (rec.scoringFeatures as Record<string, unknown>)
        : null;
    const breakdown =
      (typeof rec.breakdown === 'object' && rec.breakdown !== null
        ? (rec.breakdown as Record<string, unknown>)
        : null) ??
      (scoringFeatures &&
      typeof scoringFeatures.scoreBreakdown === 'object' &&
      scoringFeatures.scoreBreakdown !== null
        ? (scoringFeatures.scoreBreakdown as Record<string, unknown>)
        : null) ??
      null;

    return {
      id: typeof rec.id === 'string' ? rec.id : '',
      leadId: typeof rec.leadId === 'string' ? rec.leadId : '',
      workflowRunId:
        typeof rec.workflowRunId === 'string' ? rec.workflowRunId : null,
      score: Number(rec.score),
      label: rec.label as ScoreLabel,
      reason: typeof rec.reason === 'string' ? rec.reason : null,
      breakdown,
      scoringFeatures,
      modelProvider:
        typeof rec.modelProvider === 'string' ? rec.modelProvider : null,
      modelName: typeof rec.modelName === 'string' ? rec.modelName : null,
      modelVersion:
        typeof rec.modelVersion === 'string' ? rec.modelVersion : null,
      inputSnapshot:
        typeof rec.inputSnapshot === 'object' && rec.inputSnapshot !== null
          ? (rec.inputSnapshot as Record<string, unknown>)
          : null,
      outputSnapshot:
        typeof rec.outputSnapshot === 'object' && rec.outputSnapshot !== null
          ? (rec.outputSnapshot as Record<string, unknown>)
          : null,
      createdAt: rec.createdAt instanceof Date ? rec.createdAt : new Date(),
    };
  }

  static toResponseDtoList(
    entities: (LeadScore | Record<string, unknown>)[],
  ): ScoringResponseDto[] {
    return entities.map((item) => this.toResponseDto(item));
  }

  static toCallbackResponseDto(result: {
    score: LeadScore | Record<string, unknown> | null;
    workflowRunUpdated: boolean;
  }): ScoringCallbackResponseDto {
    return {
      score: result.score ? this.toResponseDto(result.score) : null,
      workflowRunUpdated: result.workflowRunUpdated,
    };
  }

  static toContextResponseDto(context: {
    lead: Lead | Record<string, unknown>;
    qualification: LeadQualification | null;
    enrichment: LeadEnrichment | Record<string, unknown> | null;
    interactions: (Interaction | Record<string, unknown>)[];
    scoringFeatures: Record<string, unknown>;
  }): ScoringContextResponseDto {
    return {
      lead: context.lead,
      qualification: context.qualification
        ? QualificationMapper.toResponseDto(context.qualification)
        : null,
      enrichment: context.enrichment
        ? EnrichmentMapper.toResponseDto(context.enrichment)
        : null,
      interactions: context.interactions || [],
      scoringFeatures: context.scoringFeatures || {},
    };
  }
}
