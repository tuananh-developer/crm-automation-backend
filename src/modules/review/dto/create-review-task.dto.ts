import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReviewTaskDto {
  @IsUUID()
  leadId!: string;

  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
