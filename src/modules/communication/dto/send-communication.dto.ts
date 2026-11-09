import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendCommunicationDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  to!: string;

  @ApiProperty({ description: 'Email subject' })
  @IsString()
  subject!: string;

  @ApiPropertyOptional({ description: 'HTML body' })
  @IsOptional()
  @IsString()
  html?: string;

  @ApiPropertyOptional({ description: 'Plain text body' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ description: 'Correlation ID' })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiProperty({ description: 'Stable idempotency key for this delivery' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey!: string;
}
