import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

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
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return typeof value === 'boolean' ? value : null;
  })
  @IsBoolean()
  escalationRequired?: boolean;

  @ApiPropertyOptional({ description: 'Raw generative AI output payload' })
  @IsOptional()
  rawAIOutput?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Error message if status is FAILED' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
