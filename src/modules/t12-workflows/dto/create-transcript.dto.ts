import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTranscriptDto {
  @ApiPropertyOptional({
    description: 'Associated customer UUID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ description: 'Associated lead UUID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  leadId?: string;

  @ApiPropertyOptional({
    description: 'Associated sales meeting UUID',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  meetingId?: string;

  @ApiPropertyOptional({
    description:
      'Caller-supplied source event identifier (required when meetingId and idempotencyKey are omitted)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceEventId?: string;

  @ApiPropertyOptional({
    description: 'Idempotency key for request deduplication',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Conversation channel/source type',
    example: 'CALL',
    enum: ['CALL', 'MEETING', 'EMAIL', 'CHAT'],
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description:
      'Conversation transcript text (will be redacted before AI processing)',
    example:
      'Customer discussed upgrading to Enterprise plan with 50 user licenses next month.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120000)
  rawTranscript?: string;

  @ApiPropertyOptional({
    description: 'Alias for rawTranscript',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120000)
  content?: string;
}
