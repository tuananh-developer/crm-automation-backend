import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStepDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  channel?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  actionType!: string;

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  contentTemplate?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
