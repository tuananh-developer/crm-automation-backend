import type { ReviewTask } from '../entities/review-task.entity.js';
import {
  ReviewAssigneeResponseDto,
  ReviewTaskResponseDto,
} from '../dto/review-task-response.dto.js';

export class ReviewTaskMapper {
  static toResponseDto(entity: ReviewTask): ReviewTaskResponseDto {
    const raw = entity as unknown as Record<string, unknown>;
    const dto: ReviewTaskResponseDto = {
      id: entity.id,
      leadId: entity.leadId,
      workflowRunId: entity.workflowRunId ?? null,
      taskType:
        typeof raw.taskType === 'string'
          ? raw.taskType
          : 'AI_QUALIFICATION_REVIEW',
      status: entity.status,
      priority: typeof raw.priority === 'string' ? raw.priority : null,
      reason: entity.reason ?? null,
      decision: entity.decision ?? null,
      reviewComment: entity.reviewComment ?? null,
      resolutionNotes:
        entity.reviewComment ??
        (typeof raw.resolutionNotes === 'string' ? raw.resolutionNotes : null),
      assignedTo: entity.assignedTo ?? null,
      startedAt: entity.startedAt ?? null,
      resolvedAt: entity.resolvedAt ?? null,
      createdAt: entity.createdAt ?? new Date(),
    };

    if (entity.assignee) {
      const assignee: ReviewAssigneeResponseDto = {
        id: entity.assignee.id,
        name: entity.assignee.name,
        email: entity.assignee.email,
        role: entity.assignee.role,
        status: entity.assignee.status,
      };
      dto.assignee = assignee;
    } else {
      dto.assignee = null;
    }

    return dto;
  }

  static toResponseDtoList(entities: ReviewTask[]): ReviewTaskResponseDto[] {
    return entities.map((task) => this.toResponseDto(task));
  }
}
