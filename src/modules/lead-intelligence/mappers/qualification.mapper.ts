import type { LeadQualification } from '../entities/lead-qualification.entity.js';
import { QualificationStatus } from '../enums/lead-intelligence.enum.js';
import type { LeadStatus } from '../../leads/enums/lead.enum.js';
import {
  QualificationCallbackResponseDto,
  QualificationResponseDto,
} from '../dto/qualification-response.dto.js';

export class QualificationMapper {
  static toResponseDto(
    entity: LeadQualification,
    reviewRequired?: boolean,
  ): QualificationResponseDto {
    const isReviewRequired =
      reviewRequired !== undefined
        ? reviewRequired
        : (entity.confidence !== null &&
            entity.confidence !== undefined &&
            entity.confidence < 0.8) ||
          entity.status === QualificationStatus.NEEDS_REVIEW;

    return {
      id: entity.id,
      leadId: entity.leadId,
      workflowRunId: entity.workflowRunId ?? null,
      status: entity.status,
      intent: entity.intent ?? null,
      confidence:
        entity.confidence !== null && entity.confidence !== undefined
          ? Number(entity.confidence)
          : null,
      reason: entity.reason ?? null,
      reasoning: entity.reason ?? null,
      reviewRequired: isReviewRequired,
      modelProvider: entity.modelProvider ?? null,
      modelName: entity.modelName ?? null,
      modelVersion: entity.modelVersion ?? null,
      inputSnapshot: entity.inputSnapshot ?? null,
      outputSnapshot: entity.outputSnapshot ?? null,
      createdAt: entity.createdAt,
    };
  }

  static toResponseDtoList(
    entities: LeadQualification[],
  ): QualificationResponseDto[] {
    return entities.map((item) => this.toResponseDto(item));
  }

  static toCallbackResponseDto(result: {
    qualification: LeadQualification;
    leadStatus: LeadStatus;
    reviewRequired: boolean;
    reviewTaskId?: string;
  }): QualificationCallbackResponseDto {
    return {
      qualification: this.toResponseDto(
        result.qualification,
        result.reviewRequired,
      ),
      leadStatus: result.leadStatus,
      reviewRequired: result.reviewRequired,
      reviewTaskId: result.reviewTaskId ?? null,
    };
  }
}
