import { CustomerResponseDto } from '../dto/customer-response.dto';
import { Customer } from '../entities/customer.entity';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { LeadMapper } from '../../leads/mappers/lead.mapper.js';
import type { User } from '../../users/entities/user.entity.js';

export class CustomerMapper {
  static toResponseDto(
    entity: Customer & { segmentCount?: number },
  ): CustomerResponseDto {
    const dto = Object.assign(new CustomerResponseDto(), {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      phone: entity.phone,
      companyName: entity.companyName,
      companyWebsite: entity.companyWebsite,
      jobTitle: entity.jobTitle,
      companySize: entity.companySize,
      industry: entity.industry,
      status: entity.status,
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      segmentCount: entity.segmentCount,
    });

    if (entity.creator) {
      dto.creator = this.toUserResponseDto(entity.creator);
    }
    if (entity.updater) {
      dto.updater = this.toUserResponseDto(entity.updater);
    }

    if (entity.customerSegments) {
      dto.segments = entity.customerSegments.map((assignment) => ({
        id: assignment.segment?.id ?? assignment.segmentId,
        name: assignment.segment?.name ?? null,
        assignmentType: assignment.assignmentType,
        confidence: assignment.confidence,
        assignedReason: assignment.assignedReason,
        assignedAt: assignment.assignedAt,
      }));
      dto.customerSegments = entity.customerSegments.map((assignment) => ({
        customerId: assignment.customerId,
        segmentId: assignment.segmentId,
        assignmentType: assignment.assignmentType,
        confidence: assignment.confidence,
        assignedReason: assignment.assignedReason,
        assignedAt: assignment.assignedAt,
        assignedBy: assignment.assignedBy,
        ...(assignment.segment
          ? {
              segment: {
                id: assignment.segment.id,
                name: assignment.segment.name,
              },
            }
          : {}),
        ...(assignment.assignedByUser
          ? {
              assignedByUser: {
                id: assignment.assignedByUser.id,
                name: assignment.assignedByUser.name,
                email: assignment.assignedByUser.email,
              },
            }
          : {}),
      }));
    }

    if (entity.convertedLeads) {
      dto.convertedLeads = LeadMapper.toResponseDtoList(entity.convertedLeads);
    }

    return dto;
  }

  static toResponseDtoArray(entities: Customer[]): CustomerResponseDto[] {
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
