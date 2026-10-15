import { LeadFollowUpEnrollmentResponseDto } from '../dto/lead-follow-up-enrollment-response.dto';
import { LeadFollowUpEnrollment } from '../entities/lead-follow-up-enrollment.entity';

export class LeadFollowUpEnrollmentMapper {
  static toResponseDto(
    entity: LeadFollowUpEnrollment,
  ): LeadFollowUpEnrollmentResponseDto {
    const dto = Object.assign(new LeadFollowUpEnrollmentResponseDto(), {
      id: entity.id,
      leadId: entity.leadId,
      sequenceId: entity.sequenceId,
      currentStepId: entity.currentStepId,
      status: entity.status,
      startedAt: entity.startedAt,
      pausedAt: entity.pausedAt,
      completedAt: entity.completedAt,
      cancelledAt: entity.cancelledAt,
      assignedBy: entity.assignedBy,
      cancellationReason: entity.cancellationReason,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      executionCount: entity.executions?.length ?? 0,
    });

    // Handle lead relation if it is loaded
    if (entity.lead) {
      // We'll pick only the fields we want to expose
      dto.lead = {
        id: entity.lead.id,
        firstName: entity.lead.firstName,
        lastName: entity.lead.lastName ?? null,
        email: entity.lead.email,
        phone: entity.lead.phone ?? null,
        companyName: entity.lead.companyName ?? null,
      };
    }

    // Handle sequence relation if it is loaded
    if (entity.sequence) {
      dto.sequence = {
        id: entity.sequence.id,
        name: entity.sequence.name,
        status: entity.sequence.status,
        isActive: entity.sequence.isActive,
      };
    }

    // Handle currentStep relation if it is loaded
    if (entity.currentStep) {
      dto.currentStep = {
        id: entity.currentStep.id,
        sequenceId: entity.currentStep.sequenceId,
        stepOrder: entity.currentStep.stepOrder,
        channel: entity.currentStep.channel,
        actionType: entity.currentStep.actionType,
      };
    }

    // Handle assignedByUser relation if it is loaded
    if (entity.assignedByUser) {
      dto.assignedByUser = {
        id: entity.assignedByUser.id,
        name: entity.assignedByUser.name,
        email: entity.assignedByUser.email,
      };
    }

    // Count executions if the relation is loaded
    return dto;
  }

  static toResponseDtoArray(
    entities: LeadFollowUpEnrollment[],
  ): LeadFollowUpEnrollmentResponseDto[] {
    return entities.map((entity) => this.toResponseDto(entity));
  }
}
