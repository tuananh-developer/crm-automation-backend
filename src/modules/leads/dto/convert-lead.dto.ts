import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertLeadDto {
  @ApiProperty({
    description: 'User UUID who will own the converted customer',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Notes about the conversion',
    example: 'Converted after demo call',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
