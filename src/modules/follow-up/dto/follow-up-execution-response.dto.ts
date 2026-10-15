import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import { EnrollmentStatus, ExecutionStatus } from '../enums/follow-up.enum.js';
import type { LeadFollowUpEnrollment } from '../entities/lead-follow-up-enrollment.entity.js';
import type { FollowUpStep } from '../entities/follow-up-step.entity.js';

export class FollowUpExecutionResponseDto {
  @ApiProperty({ description: 'ID định danh của thực thi follow-up' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'ID của bản ghi đăng ký follow-up' })
  @IsUUID()
  enrollmentId!: string;

  @ApiProperty({ description: 'ID của bước follow-up được thực thi' })
  @IsUUID()
  stepId!: string;

  @ApiProperty({ enum: ExecutionStatus, description: 'Trạng thái thực thi' })
  status!: ExecutionStatus;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian được lên lịch để thực thi',
  })
  scheduledAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian bắt đầu thực thi',
  })
  startedAt!: Date | null;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Thời gian hoàn thành thực thi',
  })
  completedAt!: Date | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ID thông điệp từ provider',
  })
  providerMessageId!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Payload yêu cầu gửi đến provider',
  })
  requestPayload!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Payload phản hồi từ provider',
  })
  responsePayload!: Record<string, unknown> | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Thông báo lỗi (nếu có)',
  })
  errorMessage!: string | null;

  @ApiProperty({ description: 'Số lần thử lại' })
  @IsInt()
  @Min(0)
  retryCount!: number;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Related information (optional, only included when specifically requested)
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      leadId: { type: 'string', format: 'uuid' },
      sequenceId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: Object.values(EnrollmentStatus) },
    },
    required: ['id', 'leadId', 'sequenceId', 'status'],
    description: 'Thông tin đăng ký follow-up liên quan',
  })
  enrollment?: Pick<
    LeadFollowUpEnrollment,
    'id' | 'leadId' | 'sequenceId' | 'status'
  >;

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
    description: 'Thông tin bước follow-up liên quan',
  })
  step?: Pick<
    FollowUpStep,
    'id' | 'sequenceId' | 'stepOrder' | 'channel' | 'actionType'
  >;
}
