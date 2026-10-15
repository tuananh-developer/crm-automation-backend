import { SegmentResponseDto } from '../dto/segment-response.dto';
import { Segment } from '../entities/segment.entity';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import type { User } from '../../users/entities/user.entity.js';

export class SegmentMapper {
  static toResponseDto(
    entity: Segment & { customerCount?: number },
  ): SegmentResponseDto {
    const dto = Object.assign(new SegmentResponseDto(), {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      criteria: entity.criteria,
      isActive: entity.isActive,
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      customerCount: entity.customerCount ?? 0,
    });

    if (entity.creator) {
      dto.creator = this.toUserResponseDto(entity.creator);
    }

    if (entity.updater) {
      dto.updater = this.toUserResponseDto(entity.updater);
    }

    return dto;
  }

  static toResponseDtoArray(
    entities: Array<Segment & { customerCount?: number }>,
  ): SegmentResponseDto[] {
    return entities.map((entity) => this.toResponseDto(entity));
  }

  private static toUserResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
