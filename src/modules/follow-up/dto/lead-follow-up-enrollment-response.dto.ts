import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import {
  EnrollmentStatus,
  FollowUpSequenceStatus,
} from '../enums/follow-up.enum.js';
import type { Lead } from '../../leads/entities/lead.entity.js';
import type { FollowUpSequence } from '../entities/follow-up-sequence.entity.js';
import type { FollowUpStep } from '../entities/follow-up-step.entity.js';
import type { User } from '../../users/entities/user.entity.js';

export class LeadFollowUpEnrollmentResponseDto {
  @ApiProperty({ description: 'ID định danh của bản ghi đăng ký follow-up' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'ID củaリード liên quan' })
  @IsUUID()
  leadId!: string;

  @ApiProperty({ description: 'ID của chuỗi follow-up liên quan' })
  @IsUUID()
  sequenceId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'ID của bước follow-up hiện tại',
  })
  @IsUUID()
  currentStepId!: string | null;

  @ApiProperty({ enum: EnrollmentStatus, description: 'Trạng thái đăng ký' })
  status!: EnrollmentStatus;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian bắt đầu đăng ký',
  })
  startedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian tạm dừng đăng ký (nếu có)',
  })
  pausedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian hoàn thành đăng ký',
  })
  completedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian hủy đăng ký (nếu có)',
  })
  cancelledAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'ID người gán đăng ký này',
  })
  @IsUUID()
  assignedBy!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Lý do hủy đăng ký (nếu có)',
  })
  cancellationReason!: string | null;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Related information (optional, only included when specifically requested)
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string' },
      lastName: { type: 'string', nullable: true },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string', nullable: true },
      companyName: { type: 'string', nullable: true },
    },
    required: ['id', 'firstName', 'lastName', 'email', 'phone', 'companyName'],
    description: 'Thông tin lead liên quan',
  })
  lead?: Pick<
    Lead,
    'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'companyName'
  >;

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      status: { type: 'string', enum: Object.values(FollowUpSequenceStatus) },
      isActive: { type: 'boolean' },
    },
    required: ['id', 'name', 'status', 'isActive'],
    description: 'Thông tin chuỗi follow-up liên quan',
  })
  sequence?: Pick<FollowUpSequence, 'id' | 'name' | 'status' | 'isActive'>;

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      sequenceId: { type: 'string', format: 'uuid' },
      stepOrder: { type: 'integer' },
      channel: { type: 'string' },
      actionType: { type: 'string' },
    },
    required: ['id', 'sequenceId', 'stepOrder', 'channel', 'actionType'],
    description: 'Thông tin bước follow-up hiện tại (nếu có)',
  })
  currentStep?: Pick<
    FollowUpStep,
    'id' | 'sequenceId' | 'stepOrder' | 'channel' | 'actionType'
  >;

  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
    },
    required: ['id', 'name', 'email'],
    description: 'Thông tin người gán đăng ký (nếu có)',
  })
  assignedByUser?: Pick<User, 'id' | 'name' | 'email'>;

  @ApiProperty({
    description: 'Số lượng thực thi liên quan đến đăng ký này',
  })
  @IsInt()
  @Min(0)
  executionCount!: number;
}
