import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { SegmentAssignmentType } from '../enums/customer.enum.js';
import { LeadResponseDto } from '../../leads/dto/lead-response.dto.js';

export class CustomerSegmentSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name!: string | null;

  @ApiProperty()
  assignmentType!: SegmentAssignmentType;

  @ApiPropertyOptional()
  confidence!: number | null;

  @ApiPropertyOptional()
  assignedReason!: string | null;

  @ApiProperty()
  assignedAt!: Date;
}

export class CustomerSegmentResponseDto {
  @ApiProperty()
  customerId!: string;

  @ApiProperty()
  segmentId!: string;

  @ApiProperty()
  assignmentType!: SegmentAssignmentType;

  @ApiPropertyOptional()
  confidence!: number | null;

  @ApiPropertyOptional()
  assignedReason!: string | null;

  @ApiProperty()
  assignedAt!: Date;

  @ApiPropertyOptional()
  assignedBy!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
  })
  segment?: { id: string; name: string };

  @ApiPropertyOptional({ type: () => UserResponseDto })
  assignedByUser?: Pick<UserResponseDto, 'id' | 'name' | 'email'>;
}

export class CustomerResponseDto {
  @Expose()
  @ApiProperty()
  @IsUUID()
  id!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(320)
  email!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  companyName!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  companyWebsite!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(150)
  jobTitle!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  companySize!: number | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(150)
  industry!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(30)
  status!: string | null;

  @Expose()
  @ApiProperty()
  @IsUUID()
  createdBy!: string;

  @Expose()
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  updatedBy!: string | null;

  @Expose()
  @ApiPropertyOptional()
  @IsOptional()
  notes!: string | null;

  @Expose()
  @ApiProperty()
  @IsOptional()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  @IsOptional()
  updatedAt!: Date;

  // Creator information (excluding sensitive fields like passwordHash)
  @Expose()
  @ApiPropertyOptional({ type: () => UserResponseDto })
  @IsOptional()
  creator?: UserResponseDto;

  @Expose()
  @ApiPropertyOptional({ type: () => UserResponseDto })
  @IsOptional()
  updater?: UserResponseDto;

  @Expose()
  @ApiPropertyOptional({ type: () => [CustomerSegmentSummaryResponseDto] })
  segments?: CustomerSegmentSummaryResponseDto[];

  @Expose()
  @ApiPropertyOptional({ type: () => [CustomerSegmentResponseDto] })
  customerSegments?: CustomerSegmentResponseDto[];

  @Expose()
  @ApiPropertyOptional({ type: () => [LeadResponseDto] })
  convertedLeads?: LeadResponseDto[];

  @Expose()
  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  segmentCount?: number;
}
