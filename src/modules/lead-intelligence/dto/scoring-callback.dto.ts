import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ScoreLabel } from '../enums/lead-intelligence.enum.js';

export class ScoringCallbackDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  /**
   * Execution status from n8n / external service: 'SUCCESS' | 'FAILED'.
   * Defaults to 'SUCCESS' if omitted.
   */
  @IsOptional()
  @IsString()
  status?: 'SUCCESS' | 'FAILED';

  @ValidateIf((o: ScoringCallbackDto) => !o.status || o.status === 'SUCCESS')
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @ValidateIf((o: ScoringCallbackDto) => !o.status || o.status === 'SUCCESS')
  @IsEnum(ScoreLabel)
  label?: ScoreLabel;

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

  /** Comprehensive model details (name, version, tokens, prompt latency, etc.) */
  @IsOptional()
  modelInfo?: Record<string, unknown> | string;

  @IsOptional()
  @IsObject()
  scoringFeatures?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  inputSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSnapshot?: Record<string, unknown>;

  /** Full input and raw output snapshot for complete audit trail */
  @IsOptional()
  @IsObject()
  inputOutputSnapshot?: Record<string, unknown>;

  /** Human-readable error message when status is FAILED */
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

/**
 * Business rule for lead score labeling (Quy tắc gán nhãn phụ phòng ngừa):
 *  - HOT:  score >= 75
 *  - WARM: 40 <= score < 75
 *  - COLD: score < 40
 */
export function computeScoreLabel(score: number): ScoreLabel {
  if (score >= 75) {
    return ScoreLabel.HOT;
  }
  if (score >= 40) {
    return ScoreLabel.WARM;
  }
  return ScoreLabel.COLD;
}
