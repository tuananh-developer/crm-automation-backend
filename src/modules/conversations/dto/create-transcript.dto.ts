import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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
    description: 'Conversation channel/source type',
    example: 'CALL',
    enum: ['CALL', 'MEETING', 'EMAIL', 'CHAT'],
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiProperty({
    description:
      'Conversation transcript text (will be redacted before AI processing)',
    example:
      'Customer discussed upgrading to Enterprise plan with 50 user licenses next month.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50000)
  content!: string;
}
