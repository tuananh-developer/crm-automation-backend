import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @ApiProperty({
    description: 'UUID của user thực hiện chuyển đổi',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
