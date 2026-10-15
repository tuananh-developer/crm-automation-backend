import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
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

  @ApiPropertyOptional({
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

  @ApiPropertyOptional({ description: 'Chủ đề mẫu' })
  subjectTemplate!: string | null;

  @ApiPropertyOptional({ description: 'Nội dung mẫu' })
  contentTemplate!: string | null;

  @ApiPropertyOptional({ description: 'Điều kiện thực hiện (JSON)' })
  conditions!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Siêu dữ liệu (JSON)' })
  metadata!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Cấu hình hành động' })
  actionConfig!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Có đang hoạt động không' })
  @IsOptional()
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  // Execution information (optional, only included when specifically requested)
  @ApiPropertyOptional({ description: 'Thực thi gần nhất của bước này' })
  latestExecution?: Partial<FollowUpExecution> & {
    id: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
}
