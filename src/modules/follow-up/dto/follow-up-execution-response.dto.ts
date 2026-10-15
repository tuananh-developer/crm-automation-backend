import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';
import { ExecutionStatus } from '../enums/follow-up.enum.js';
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

  @ApiPropertyOptional({ description: 'Thời gian được lên lịch để thực thi' })
  scheduledAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời gian bắt đầu thực thi' })
  startedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Thời gian hoàn thành thực thi' })
  completedAt!: Date | null;

  @ApiPropertyOptional({ description: 'ID thông điệp từ provider' })
  providerMessageId!: string | null;

  @ApiPropertyOptional({ description: 'Payload yêu cầu gửi đến provider' })
  requestPayload!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Payload phản hồi từ provider' })
  responsePayload!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Thông báo lỗi (nếu có)' })
  errorMessage!: string | null;

  @ApiPropertyOptional({ description: 'Số lần thử lại' })
  @IsInt()
  @Min(0)
  retryCount!: number;

  @ApiPropertyOptional({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Related information (optional, only included when specifically requested)
  @ApiPropertyOptional({ description: 'Thông tin đăng ký follow-up liên quan' })
  enrollment?: Pick<
    LeadFollowUpEnrollment,
    'id' | 'leadId' | 'sequenceId' | 'status'
  >;

  @ApiPropertyOptional({ description: 'Thông tin bước follow-up liên quan' })
  step?: Pick<
    FollowUpStep,
    'id' | 'sequenceId' | 'stepOrder' | 'channel' | 'actionType'
  >;
}
