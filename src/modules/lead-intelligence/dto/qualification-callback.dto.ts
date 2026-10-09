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
import { QualificationStatus } from '../enums/lead-intelligence.enum.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QualificationCallbackDto {
  @ApiProperty({
    description: 'Lead UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  leadId!: string;

  @ApiPropertyOptional({
    description: 'Workflow run UUID',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  workflowRunId?: string;

  @ApiProperty({
    description: 'Qualification status',
    example: 'QUALIFIED',
    enum: QualificationStatus,
  })
  @IsEnum(QualificationStatus)
  status!: QualificationStatus;

  @ApiPropertyOptional({
    description: 'Detected intent',
    example: 'PURCHASE_INQUIRY',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  intent?: string;

  @ApiProperty({
    description: 'Confidence score (0-1)',
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
    description: 'Reason for the qualification result',
    example: 'Lead has budget and authority',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Recommended next action',
    example: 'Schedule demo call',
  })
  @IsString()
  @IsOptional()
  nextAction?: string;

  @ApiPropertyOptional({
    description: 'Whether human review is required',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  reviewRequired?: boolean;

  @ApiPropertyOptional({
    description: 'AI model provider',
    example: 'openai',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelProvider?: string;

  @ApiPropertyOptional({
    description: 'AI model name',
    example: 'gpt-4',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  modelName?: string;

  @ApiPropertyOptional({
    description: 'AI model version',
    example: '2024-01-01',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelVersion?: string;

  @ApiPropertyOptional({
    description: 'Input snapshot for the qualification',
    example: { leadData: '...' },
  })
  @IsObject()
  @IsOptional()
  inputSnapshot?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Output snapshot from the qualification',
    example: { result: 'QUALIFIED', details: '...' },
  })
  @IsObject()
  @IsOptional()
  outputSnapshot?: Record<string, any>;
}
