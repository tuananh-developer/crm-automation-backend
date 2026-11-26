import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ClaimCustomer360ProfileDto {
  @ApiProperty({ description: 'WorkflowRun UUID correlated to this execution' })
  @IsUUID()
  @IsNotEmpty()
  workflowRunId!: string;

  @ApiProperty({
    description: 'n8n execution ID used to claim and fence the WorkflowRun',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  n8nExecutionId!: string;
}
