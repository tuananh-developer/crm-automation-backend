import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ExecutionStatus } from '../enums/follow-up.enum.js';

export class QueryFollowUpExecutionDto {
  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsUUID()
  stepId?: string;

  @IsOptional()
  @IsEnum(ExecutionStatus)
  status?: ExecutionStatus;
}
