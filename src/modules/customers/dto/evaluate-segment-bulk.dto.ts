import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SegmentAssignmentType } from '../enums/customer.enum.js';

export class EvaluateSegmentBulkDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  customerIds?: string[];

  @IsEnum(SegmentAssignmentType)
  assignmentType!: SegmentAssignmentType;
}
