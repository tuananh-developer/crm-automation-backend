import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReviewTaskDto {
  @ApiProperty({
    description: 'Lead UUID for the review task',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional({
    description: 'Workflow run UUID (must belong to the lead)',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @ApiPropertyOptional({
    description: 'Reason for creating the review task',
    example: 'AI confidence below threshold',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
