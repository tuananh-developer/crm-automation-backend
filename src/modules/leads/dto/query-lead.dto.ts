import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/index.js';
import { LeadStatus } from '../enums/lead.enum.js';

export class QueryLeadDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: LeadStatus,
    description: 'Lọc theo trạng thái Lead',
  })
  @IsOptional()
  status?: LeadStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nguồn Lead',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID người phụ trách',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  ownerId?: string;

  @ApiPropertyOptional({
    description: 'Trường sắp xếp dữ liệu',
    enum: [
      'createdAt',
      'updatedAt',
      'firstName',
      'lastName',
      'email',
      'companyName',
      'status',
    ],
    default: 'createdAt',
  })
  @IsString()
  @IsOptional()
  @IsIn([
    'createdAt',
    'updatedAt',
    'firstName',
    'lastName',
    'email',
    'companyName',
    'status',
  ])
  override sortBy?: string = 'createdAt';
}
