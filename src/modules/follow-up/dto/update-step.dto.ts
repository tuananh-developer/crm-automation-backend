import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateStepDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  stepOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  actionType?: string;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, any>;

  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  contentTemplate?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, any>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
