import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateSegmentDto {
  @ApiProperty({
    description: 'Customer UUID to evaluate',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({
    description: 'Segment UUID to evaluate against',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  segmentId!: string;

  @ApiPropertyOptional({
    description: 'User UUID performing the evaluation',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
