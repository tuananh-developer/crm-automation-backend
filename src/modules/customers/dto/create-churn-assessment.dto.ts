import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Evidence item submitted by the n8n workflow. The index signature lets the
 * global forbidNonWhitelisted ValidationPipe accept arbitrary keys while the
 * declared fields stay the contract for downstream consumers.
 */
export class ChurnEvidenceDto {
  [key: string]: unknown;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  value?: unknown;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateChurnAssessmentDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  score?: number;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'INSUFFICIENT_DATA'])
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'INSUFFICIENT_DATA';

  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  @IsOptional()
  @IsString()
  policyVersion?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChurnEvidenceDto)
  evidence?: ChurnEvidenceDto[];

  @IsOptional()
  @IsObject()
  coverage?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  workflowRunId?: string;
}
