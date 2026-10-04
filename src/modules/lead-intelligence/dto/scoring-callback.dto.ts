import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ScoreLabel } from '../enums/lead-intelligence.enum.js';

export class ScoringCallbackDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @IsEnum(ScoreLabel)
  label!: ScoreLabel;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  modelProvider?: string;

  @IsOptional()
  @IsString()
  modelName?: string;

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsOptional()
  @IsObject()
  scoringFeatures?: Record<string, any>;

  @IsOptional()
  @IsObject()
  inputSnapshot?: Record<string, any>;

  @IsOptional()
  @IsObject()
  outputSnapshot?: Record<string, any>;
}

/**
 * Business rule for lead score labeling:
 *  - HOT:  score >= 70
 *  - WARM: 40 <= score < 70
 *  - COLD: score < 40
 */
export function computeScoreLabel(score: number): ScoreLabel {
  if (score >= 70) {
    return ScoreLabel.HOT;
  }
  if (score >= 40) {
    return ScoreLabel.WARM;
  }
  return ScoreLabel.COLD;
}
