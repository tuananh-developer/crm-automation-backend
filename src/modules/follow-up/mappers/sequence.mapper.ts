import { FollowUpSequenceResponseDto } from '../dto/sequence-response.dto';
import { FollowUpSequence } from '../entities/follow-up-sequence.entity';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { FollowUpStepMapper } from './follow-up-step.mapper.js';

export class FollowUpSequenceMapper {
  static toResponseDto(entity: FollowUpSequence): FollowUpSequenceResponseDto {
    const dto = Object.assign(new FollowUpSequenceResponseDto(), {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      isActive: entity.isActive,
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      stepCount: entity.steps?.length ?? 0,
    });

    // Handle creator relation if it is loaded
    if (entity.creator) {
      dto.creator = Object.assign(new UserResponseDto(), {
        id: entity.creator.id,
        name: entity.creator.name,
        email: entity.creator.email,
        role: entity.creator.role,
        status: entity.creator.status,
        lastLoginAt: entity.creator.lastLoginAt,
        createdAt: entity.creator.createdAt,
        updatedAt: entity.creator.updatedAt,
      });
    }

    // Handle updater relation if it is loaded
    if (entity.updater) {
      dto.updater = Object.assign(new UserResponseDto(), {
        id: entity.updater.id,
        name: entity.updater.name,
        email: entity.updater.email,
        role: entity.updater.role,
        status: entity.updater.status,
        lastLoginAt: entity.updater.lastLoginAt,
        createdAt: entity.updater.createdAt,
        updatedAt: entity.updater.updatedAt,
      });
    }

    // Handle steps relation if it is loaded
    if (entity.steps) {
      dto.steps = FollowUpStepMapper.toResponseDtoArray(entity.steps);
      dto.stepCount = entity.steps.length;
    } else {
      dto.stepCount = 0;
    }

    return dto;
  }

  static toResponseDtoArray(
    entities: FollowUpSequence[],
  ): FollowUpSequenceResponseDto[] {
    return entities.map((entity) => this.toResponseDto(entity));
  }
}
