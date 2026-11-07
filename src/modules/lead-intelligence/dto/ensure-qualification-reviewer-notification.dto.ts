import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class EnsureQualificationReviewerNotificationDto {
  @ApiProperty({ description: 'UUID of the originating RabbitMQ event' })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ description: 'UUID of the Lead' })
  @IsUUID()
  leadId!: string;

  @ApiProperty({ description: 'UUID of the qualification WorkflowRun' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ description: 'UUID returned by the qualification callback' })
  @IsUUID()
  reviewTaskId!: string;

  @ApiPropertyOptional({
    description: 'UUID of the LeadQualification returned by the callback',
  })
  @IsOptional()
  @IsUUID()
  qualificationId?: string;
}
