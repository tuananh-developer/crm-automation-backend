import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';

export class ApplyCleaningDto {
  @ApiProperty({
    description: 'Array of finding IDs approved by user to apply',
    example: ['b7a9f73c-6eb2-43bb-a5a5-4eb84e3a47da'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'acceptedFindingIds must not be empty' })
  @IsUUID('4', { each: true, message: 'Each finding ID must be a valid UUID' })
  acceptedFindingIds!: string[];

  @ApiPropertyOptional({
    description: 'UUID of user applying the changes',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
