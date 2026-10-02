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

export class QualificationCallbackDto {
  @IsUUID()
  leadId!: string;

  @IsUUID()
  @IsOptional()
  workflowRunId?: string;

  @IsEnum(QualificationStatus)
  status!: QualificationStatus;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  intent?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  confidence!: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  nextAction?: string;

  @IsBoolean()
  @IsOptional()
  reviewRequired?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelProvider?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  modelName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  modelVersion?: string;

  @IsObject()
  @IsOptional()
  inputSnapshot?: Record<string, any>;

  @IsObject()
  @IsOptional()
  outputSnapshot?: Record<string, any>;
}
