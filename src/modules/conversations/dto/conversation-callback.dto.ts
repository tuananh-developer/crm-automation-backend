import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActionItemCallbackItemDto {
  @ApiProperty({ description: 'Action item title or task description' })
  @IsNotEmpty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Assignee user ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Due date timestamp' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional({ description: 'Initial status', default: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Approval state', default: 'PROPOSED' })
  @IsOptional()
  @IsString()
  approvalState?: string;
}

export class ConversationCallbackDto {
  @ApiProperty({ description: 'WorkflowRun UUID correlated to this execution' })
  @IsNotEmpty()
  @IsUUID('4')
  workflowRunId!: string;

  @ApiProperty({ description: 'ConversationTranscript UUID' })
  @IsNotEmpty()
  @IsUUID('4')
  transcriptId!: string;

  @ApiProperty({
    description: 'Overall execution status',
    enum: ['SUCCESS', 'FAILED'],
  })
  @IsNotEmpty()
  @IsString()
  status!: 'SUCCESS' | 'FAILED';

  @ApiProperty({ description: 'Executive conversational summary text' })
  @IsNotEmpty()
  @IsString()
  summaryText!: string;

  @ApiPropertyOptional({
    description: 'Detected customer sentiment',
    enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
  })
  @IsOptional()
  @IsString()
  sentiment?: string;

  @ApiPropertyOptional({
    description: 'Identified commercial or customer intent',
  })
  @IsOptional()
  @IsString()
  intent?: string;

  @ApiPropertyOptional({
    description: 'Key takeaway bullet points',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyPoints?: string[];

  @ApiPropertyOptional({
    description: 'Extracted follow-up action items',
    type: [ActionItemCallbackItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionItemCallbackItemDto)
  actionItems?: ActionItemCallbackItemDto[];

  @ApiPropertyOptional({ description: 'Raw generative AI model output' })
  @IsOptional()
  rawAIOutput?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Error message if status is FAILED' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
