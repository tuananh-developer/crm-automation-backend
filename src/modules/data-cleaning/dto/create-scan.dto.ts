import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus } from '../../leads/enums/lead.enum.js';

export class ScanFilterDto {
  @ApiPropertyOptional({
    description: 'Filter leads by status',
    enum: LeadStatus,
  })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({
    description: 'Filter leads by source ID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Filter leads by search keyword (name, email, company)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of leads to scan (default: 500, max: 2000)',
    default: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}

export class CreateScanDto {
  @ApiProperty({
    description: 'Scope of leads to scan (ALL or FILTER)',
    enum: ['ALL', 'FILTER'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'FILTER'])
  scope: 'ALL' | 'FILTER' = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter options when scope is FILTER',
    type: ScanFilterDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ScanFilterDto)
  filter?: ScanFilterDto;

  @ApiPropertyOptional({
    description: 'UUID of user triggering the scan',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
