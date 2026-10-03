import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SegmentCriterionDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  field!: string;

  @IsString()
  @IsIn([
    'equals',
    'not_equals',
    'greater_than',
    'greater_than_or_equal',
    'less_than',
    'less_than_or_equal',
    'contains',
  ])
  operator!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}

class SegmentCriteriaDto {
  @IsString()
  @IsIn(['AND', 'OR'])
  logic!: 'AND' | 'OR';

  @ValidateNested({ each: true })
  @Type(() => SegmentCriterionDto)
  conditions!: SegmentCriterionDto[];

  @IsString()
  @IsIn(['RULE', 'AI'])
  assignmentType!: 'RULE' | 'AI';

  @IsNumber()
  @Min(0)
  @IsOptional()
  minConfidence?: number | null;
}

export class CreateSegmentDto {
  @IsUUID()
  @IsNotEmpty()
  createdBy!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsObject()
  @ValidateNested()
  @Type(() => SegmentCriteriaDto)
  criteria!: SegmentCriteriaDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
