import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFeedbackDto {
  @ApiProperty({
    description: 'Customer UUID submitting feedback',
    format: 'uuid',
  })
  @IsNotEmpty()
  @IsUUID('4')
  customerId!: string;

  @ApiPropertyOptional({
    description: 'Feedback channel/source',
    example: 'WEB_FORM',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'Raw feedback text content',
    example:
      'The reporting dashboard takes over 30 seconds to load and frequently times out during peak hours.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10000)
  content!: string;

  @ApiPropertyOptional({
    description: 'Customer rating (1.0 to 5.0)',
    example: 2.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(1.0)
  @Max(5.0)
  rating?: number;
}
