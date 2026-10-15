import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { FollowUpStepResponseDto } from './follow-up-step-response.dto.js';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { FollowUpSequenceStatus } from '../enums/follow-up.enum.js';
import { LeadFollowUpEnrollmentResponseDto } from './lead-follow-up-enrollment-response.dto.js';

export class SequenceLeadEnrollmentResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty({ type: () => LeadFollowUpEnrollmentResponseDto })
  enrollment!: LeadFollowUpEnrollmentResponseDto;

  @ApiProperty({ type: () => FollowUpStepResponseDto })
  firstStep!: FollowUpStepResponseDto;
}

export class FollowUpSequenceResponseDto {
  @ApiProperty({ description: 'ID định danh của chuỗi follow-up' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Tên chuỗi follow-up', uniqueItems: true })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Mô tả chuỗi follow-up',
  })
  description!: string | null;

  @ApiProperty({
    enum: FollowUpSequenceStatus,
    description: 'Trạng thái chuỗi follow-up',
  })
  @IsOptional()
  status!: FollowUpSequenceStatus;

  @ApiProperty({ description: 'Có đang hoạt động không' })
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

  // Steps in the sequence
  @ApiPropertyOptional({ type: () => [FollowUpStepResponseDto] })
  steps?: FollowUpStepResponseDto[];

  @ApiProperty({ description: 'Số lượng bước trong chuỗi' })
  @IsInt()
  @Min(0)
  stepCount!: number;
}
