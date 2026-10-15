import { FollowUpExecutionResponseDto } from '../dto/follow-up-execution-response.dto';
import { FollowUpExecution } from '../entities/follow-up-execution.entity';

export class FollowUpExecutionMapper {
  static toResponseDto(
    entity: FollowUpExecution,
  ): FollowUpExecutionResponseDto {
    const dto = Object.assign(new FollowUpExecutionResponseDto(), {
      id: entity.id,
      enrollmentId: entity.enrollmentId,
      stepId: entity.stepId,
      status: entity.status,
      scheduledAt: entity.scheduledAt,
      startedAt: entity.startedAt,
      completedAt: entity.completedAt,
      providerMessageId: entity.providerMessageId,
      requestPayload: entity.requestPayload,
      responsePayload: entity.responsePayload,
      errorMessage: entity.errorMessage,
      retryCount: entity.retryCount,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });

    if (entity.enrollment) {
      dto.enrollment = {
        id: entity.enrollment.id,
        leadId: entity.enrollment.leadId,
        sequenceId: entity.enrollment.sequenceId,
        status: entity.enrollment.status,
      };
    }
    if (entity.step) {
      dto.step = {
        id: entity.step.id,
        sequenceId: entity.step.sequenceId,
        stepOrder: entity.step.stepOrder,
        channel: entity.step.channel,
        actionType: entity.step.actionType,
      };
    }

    return dto;
  }

  static toResponseDtoArray(
    entities: FollowUpExecution[],
  ): FollowUpExecutionResponseDto[] {
    return entities.map((entity) => this.toResponseDto(entity));
  }
}
