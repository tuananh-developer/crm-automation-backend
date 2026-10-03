import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QualificationStatus } from '../enums/lead-intelligence.enum.js';

export class QualificationCallbackDto {
  @ApiProperty({
    description: 'UUID of the lead being evaluated',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional({
    description: 'UUID of the associated WorkflowRun',
    example: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  })
  @IsUUID()
  @IsOptional()
  workflowRunId?: string;

  @ApiProperty({
    description: 'Qualification status result from AI assessment',
    enum: QualificationStatus,
    example: QualificationStatus.QUALIFIED,
  })
  @IsEnum(QualificationStatus)
  status!: QualificationStatus;

  @ApiPropertyOptional({
    description: 'Detected customer intent',
    example: 'High purchase intent for enterprise license',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  intent?: string;

  @ApiProperty({
    description: 'AI model confidence score between 0 and 1',
    example: 0.95,
    minimum: 0,
    maximum: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  confidence!: number;

  @ApiPropertyOptional({
    description: 'Explanation or reasoning given by the AI model',
    example:
      'Prospect matched ICP criteria with 150 employees and immediate requirement.',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Recommended next action for Sales team',
    example: 'Schedule product demo with senior account executive within 24h',
  })
  @IsString()
  @IsOptional()
  nextAction?: string;

  @ApiPropertyOptional({
    description: 'Flag if human sales rep review is explicitly needed',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  reviewRequired?: boolean;

  @ApiPropertyOptional({
    description: 'AI Provider name',
    example: 'google',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelProvider?: string;

  @ApiPropertyOptional({
    description: 'Model name',
    example: 'gemini-1.5-pro',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  modelName?: string;

  @ApiPropertyOptional({
    description: 'Model version',
    example: '002',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelVersion?: string;

  @ApiPropertyOptional({
    description: 'Raw input data passed to AI prompt',
    example: { company: 'FPT', title: 'IT Manager', size: 150 },
  })
  @IsObject()
  @IsOptional()
  inputSnapshot?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Raw output JSON from AI model response',
    example: { analysis: 'positive fit', urgency: 'high' },
  })
  @IsObject()
  @IsOptional()
  outputSnapshot?: Record<string, any>;
}
