import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
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
