import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSegmentDto {
  @ApiPropertyOptional({
    description: 'Segment name',
    example: 'VIP Customers',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description: 'Segment description',
    example: 'High-value customers with >$10k ARR',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Segment criteria as JSON object',
    example: { field: 'totalRevenue', operator: '>', value: 10000 },
  })
  @IsObject()
  @IsOptional()
  criteria?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Whether the segment is active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
