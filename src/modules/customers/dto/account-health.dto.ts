import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CalculateAccountHealthDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  engagement?: number | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  feedback?: number | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  openIssues?: number | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  followUpCompletion?: number | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence?: string[];
}

export class ActionEvidenceDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  snapshotId?: string;
}

export class RecommendedActionDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsArray()
  @IsOptional()
  evidence?: ActionEvidenceDto[];
}

export class ValidateActionsDto {
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  snapshotId?: string;

  @IsArray()
  @IsOptional()
  actions?: RecommendedActionDto[];
}

export class ValidateAiOutputDto {
  @IsNumber()
  @IsNotEmpty()
  score!: number;

  @IsNotEmpty()
  aiOutput!: Record<string, unknown> | string;
}
