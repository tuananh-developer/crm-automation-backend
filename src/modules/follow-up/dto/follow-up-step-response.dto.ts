import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { ExecutionStatus } from '../enums/follow-up.enum.js';
import type { FollowUpExecution } from '../entities/follow-up-execution.entity.js';

export class FollowUpStepResponseDto {
  @ApiProperty({ description: 'ID định danh của bước follow-up' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'ID của chuỗi follow-up thuộc về' })
  @IsUUID()
  sequenceId!: string;

  @ApiProperty({ description: 'Thứ tự của bước trong chuỗi' })
  @IsInt()
  @Min(0)
  stepOrder!: number;

  @ApiProperty({
    description: 'Thời gian chờ trước khi thực hiện bước (phút)',
  })
  @IsInt()
  @Min(0)
  delayMinutes!: number;

  @ApiProperty({ description: 'Kênh thực hiện (EMAIL, CALL, TASK, etc.)' })
  @IsString()
  @MaxLength(50)
  channel!: string;

  @ApiProperty({ description: 'Loại hành động' })
  @IsString()
  @MaxLength(50)
  actionType!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Chủ đề mẫu' })
  subjectTemplate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nội dung mẫu' })
  contentTemplate!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Điều kiện thực hiện (JSON)',
  })
  conditions!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Siêu dữ liệu (JSON)',
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Cấu hình hành động',
  })
  actionConfig!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Có đang hoạt động không' })
  @IsOptional()
  isActive!: boolean;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Execution information (optional, only included when specifically requested)
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: Object.values(ExecutionStatus) },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'status', 'createdAt', 'updatedAt'],
    description: 'Thực thi gần nhất của bước này',
  })
  latestExecution?: Pick<
    FollowUpExecution,
    'id' | 'status' | 'createdAt' | 'updatedAt'
  >;
}
