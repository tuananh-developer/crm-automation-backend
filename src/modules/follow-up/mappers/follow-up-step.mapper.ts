import { FollowUpStepResponseDto } from '../dto/follow-up-step-response.dto';
import { FollowUpStep } from '../entities/follow-up-step.entity';

export class FollowUpStepMapper {
  static toResponseDto(entity: FollowUpStep): FollowUpStepResponseDto {
    const dto = Object.assign(new FollowUpStepResponseDto(), {
      id: entity.id,
      sequenceId: entity.sequenceId,
      stepOrder: entity.stepOrder,
      delayMinutes: entity.delayMinutes,
      channel: entity.channel,
      actionType: entity.actionType,
      subjectTemplate: entity.subjectTemplate,
      contentTemplate: entity.contentTemplate,
      conditions: entity.conditions,
      metadata: entity.metadata,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      latestExecution: undefined,
    });

    // Compute actionConfig from metadata and conditions
    dto.actionConfig = entity.actionConfig;

    return dto;
  }

  static toResponseDtoArray(
    entities: FollowUpStep[],
  ): FollowUpStepResponseDto[] {
    return entities.map((entity) => this.toResponseDto(entity));
  }
}
