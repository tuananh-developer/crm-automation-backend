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
} from 'class-validator';

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
  evidence?: Array<Record<string, unknown>>;

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
