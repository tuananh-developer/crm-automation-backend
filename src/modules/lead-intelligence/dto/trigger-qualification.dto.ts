import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerQualificationDto {
  @ApiPropertyOptional({
    description: 'User UUID triggering the qualification',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
