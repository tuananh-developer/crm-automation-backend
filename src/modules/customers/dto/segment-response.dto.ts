import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsUUID, Min, MaxLength } from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class SegmentResponseDto {
  @ApiProperty({ description: 'ID định danh của phân khúc' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Tên phân khúc', uniqueItems: true })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả phân khúc' })
  description!: string | null;

  @ApiPropertyOptional({ description: 'Tiêu chí phân khúc (JSON)' })
  criteria!: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Trạng thái hoạt động' })
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'ID người tạo' })
  @IsUUID()
  createdBy!: string;

  @ApiPropertyOptional({ description: 'ID người cập nhật' })
  @IsUUID()
  updatedBy!: string | null;

  // Creator and updater information (excluding sensitive fields like passwordHash)
  @ApiPropertyOptional({ type: () => UserResponseDto })
  creator?: UserResponseDto;

  @ApiPropertyOptional({ type: () => UserResponseDto })
  updater?: UserResponseDto | null;

  @ApiPropertyOptional({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Số lượng khách hàng trong phân khúc' })
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

  @ApiProperty()
  assignmentType!: string;

  @ApiProperty()
  confidence!: number;

  @ApiProperty()
  assignmentReason!: string;

  @ApiProperty()
  assignedAt!: Date;

  @ApiProperty()
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
