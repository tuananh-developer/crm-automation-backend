import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { SegmentAssignmentType } from '../enums/customer.enum.js';

export class EvaluateSegmentDto {
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @IsEnum(SegmentAssignmentType)
  assignmentType!: SegmentAssignmentType;
}
