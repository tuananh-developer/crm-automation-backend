import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CLAIMABLE_T12_WORKFLOWS = [
  'T12-WF10_NEXT_BEST_ACTION',
  'T12-WF11_SALES_MEETING',
  'T12-WF12_QUOTE_PROPOSAL',
] as const;

export type ClaimableT12Workflow = (typeof CLAIMABLE_T12_WORKFLOWS)[number];

export const FAILABLE_WORKFLOW_NAMES = [
  'lead-qualification',
  'UC10_DATA_CLEANING',
  ...CLAIMABLE_T12_WORKFLOWS,
] as const;

export type FailableWorkflowName = (typeof FAILABLE_WORKFLOW_NAMES)[number];

export class ClaimWorkflowExecutionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ enum: CLAIMABLE_T12_WORKFLOWS })
  @IsIn(CLAIMABLE_T12_WORKFLOWS)
  workflowName!: ClaimableT12Workflow;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;
}

export class FailWorkflowExecutionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @ApiProperty({ enum: FAILABLE_WORKFLOW_NAMES })
  @IsIn(FAILABLE_WORKFLOW_NAMES)
  workflowName!: FailableWorkflowName;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty({ example: 'UPSTREAM_PROVIDER_FAILURE' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  errorCategory!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  failedNodeName?: string;
}
