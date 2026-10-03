import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class ExecuteFollowUpDto {
  @IsUUID()
  @IsNotEmpty()
  enrollmentId!: string;

  @IsOptional()
  @IsUUID()
  stepId?: string;
}
