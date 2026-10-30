import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class FeedbackCallbackDto {
  @ApiProperty({ description: 'CustomerFeedback UUID' })
  @IsNotEmpty()
  @IsUUID('4')
  feedbackId!: string;

  @ApiProperty({ description: 'WorkflowRun UUID correlated to this execution' })
  @IsNotEmpty()
  @IsUUID('4')
  workflowRunId!: string;

  @ApiProperty({ description: 'Execution status', enum: ['SUCCESS', 'FAILED'] })
  @IsNotEmpty()
  @IsString()
  status!: 'SUCCESS' | 'FAILED';

  @ApiPropertyOptional({
    description: 'Classified sentiment',
    enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
  })
  @IsOptional()
  @IsString()
  sentiment?: string;

  @ApiPropertyOptional({ description: 'Classified feedback category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Assessed urgency',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsString()
  urgency?: string;

  @ApiPropertyOptional({
    description: 'Escalation requirement flag',
    default: false,
  })
  @IsOptional()
  escalationRequired?: boolean;

  @ApiPropertyOptional({ description: 'Raw generative AI output payload' })
  @IsOptional()
  rawAIOutput?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Error message if status is FAILED' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
