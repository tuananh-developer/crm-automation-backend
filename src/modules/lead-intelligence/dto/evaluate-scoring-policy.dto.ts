import { IsNotEmpty, IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreLabel } from '../enums/lead-intelligence.enum.js';

export class EvaluateScoringPolicyDto {
  @ApiProperty({ description: 'UUID of the lead' })
  @IsUUID()
  @IsNotEmpty()
  leadId!: string;

  @ApiProperty({ description: 'Workflow run correlation ID' })
  @IsUUID()
  @IsNotEmpty()
  workflowRunId!: string;

  @ApiPropertyOptional({
    description: 'Pre-calculated or structured scoring features',
  })
  @IsOptional()
  @IsObject()
  scoringFeatures?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Features alias' })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Lead profile context' })
  @IsOptional()
  @IsObject()
  lead?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Latest qualification data' })
  @IsOptional()
  qual?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Latest enrichment data' })
  @IsOptional()
  enrich?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Recent interactions' })
  @IsOptional()
  interactions?: unknown[];
}

export class EvaluateScoringPolicyResponseDto {
  @ApiProperty({ description: 'Canonical 0-100 score' })
  score!: number;

  @ApiProperty({ enum: ScoreLabel, description: 'Canonical policy label' })
  label!: ScoreLabel;

  @ApiProperty({ description: 'Authoritative policy version' })
  policyVersion!: string;

  @ApiProperty({ description: 'Evaluation reasoning' })
  reason!: string;

  @ApiPropertyOptional({ description: 'Score breakdown points' })
  breakdown?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Evaluated scoring features' })
  scoringFeatures?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Model/Policy info' })
  modelInfo?: {
    provider: string;
    model: string;
    modelVersion: string;
  };
}
