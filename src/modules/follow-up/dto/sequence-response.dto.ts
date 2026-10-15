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

  @ApiPropertyOptional({ description: 'Mô tả chuỗi follow-up' })
  description!: string | null;

  @ApiPropertyOptional({ description: 'Trạng thái chuỗi follow-up' })
  @IsOptional()
  status!: FollowUpSequenceStatus;

  @ApiPropertyOptional({ description: 'Có đang hoạt động không' })
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

  // Steps in the sequence
  @ApiPropertyOptional({ type: () => [FollowUpStepResponseDto] })
  steps?: FollowUpStepResponseDto[];

  @ApiPropertyOptional({ description: 'Số lượng bước trong chuỗi' })
  @IsInt()
  @Min(0)
  stepCount!: number;
}
