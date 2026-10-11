import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerQualificationDto {
  @ApiPropertyOptional({
    description: 'UUID of the user requesting the qualification (optional)',
    example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
