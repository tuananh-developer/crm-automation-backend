import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import { EnrollmentStatus } from '../enums/follow-up.enum.js';
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

  @ApiPropertyOptional({ description: 'ID của bước follow-up hiện tại' })
  @IsUUID()
  currentStepId!: string | null;

  @ApiProperty({ enum: EnrollmentStatus, description: 'Trạng thái đăng ký' })
  status!: EnrollmentStatus;

  @ApiPropertyOptional({ description: 'Thời gian bắt đầu đăng ký' })
  startedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời gian tạm dừng đăng ký (nếu có)' })
  pausedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời gian hoàn thành đăng ký' })
  completedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời gian hủy đăng ký (nếu có)' })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ description: 'ID người gán đăng ký này' })
  @IsUUID()
  assignedBy!: string | null;

  @ApiPropertyOptional({ description: 'Lý do hủy đăng ký (nếu có)' })
  cancellationReason!: string | null;

  @ApiPropertyOptional({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Related information (optional, only included when specifically requested)
  @ApiPropertyOptional({ description: 'Thông tinリード liên quan' })
  lead?: Pick<
    Lead,
    'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'companyName'
  >;

  @ApiPropertyOptional({ description: 'Thông tin chuỗi follow-up liên quan' })
  sequence?: Pick<FollowUpSequence, 'id' | 'name' | 'status' | 'isActive'>;

  @ApiPropertyOptional({
    description: 'Thông tin bước follow-up hiện tại (nếu có)',
  })
  currentStep?: Pick<
    FollowUpStep,
    'id' | 'sequenceId' | 'stepOrder' | 'channel' | 'actionType'
  >;

  @ApiPropertyOptional({ description: 'Thông tin người gán đăng ký (nếu có)' })
  assignedByUser?: Pick<User, 'id' | 'name' | 'email'>;

  @ApiPropertyOptional({
    description: 'Số lượng thực thi liên quan đến đăng ký này',
  })
  @IsInt()
  @Min(0)
  executionCount!: number;
}
