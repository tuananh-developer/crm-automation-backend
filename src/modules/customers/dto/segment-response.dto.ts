import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsUUID, Min, MaxLength } from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SegmentAssignmentType } from '../enums/customer.enum.js';

export class SegmentResponseDto {
  @ApiProperty({ description: 'ID định danh của phân khúc' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Tên phân khúc', uniqueItems: true })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Mô tả phân khúc' })
  description!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Tiêu chí phân khúc (JSON)',
  })
  criteria!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Trạng thái hoạt động' })
  isActive!: boolean;

  @ApiProperty({ description: 'ID người tạo' })
  @IsUUID()
  createdBy!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'ID người cập nhật',
  })
  @IsUUID()
  updatedBy!: string | null;

  // Creator and updater information (excluding sensitive fields like passwordHash)
  @ApiPropertyOptional({ type: () => UserResponseDto })
  creator?: UserResponseDto;

  @ApiPropertyOptional({ type: () => UserResponseDto })
  updater?: UserResponseDto;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Số lượng khách hàng trong phân khúc' })
  @IsInt()
  @Min(0)
  customerCount!: number;
}

export class EvaluateSegmentResponseDto {
  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  customerName!: string;

  @ApiProperty()
  segmentId!: string;

  @ApiProperty()
  segmentName!: string;

  @ApiProperty({ enum: SegmentAssignmentType })
  assignmentType!: SegmentAssignmentType;

  @ApiProperty()
  confidence!: number;

  @ApiProperty()
  assignmentReason!: string;

  @ApiProperty()
  assignedAt!: Date;

  @ApiProperty({ type: String, nullable: true })
  assignedBy!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  matched!: boolean;
}

export class EvaluateSegmentBulkResponseDto {
  @ApiProperty()
  status!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  processed!: number;

  @ApiProperty()
  matched!: number;

  @ApiProperty()
  message!: string;
}

export class DeleteSegmentResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty()
  id!: string;
}
