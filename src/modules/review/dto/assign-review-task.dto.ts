import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignReviewTaskDto {
  @ApiProperty({
    description: 'Reviewer user UUID (must have SALES role and ACTIVE status)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  reviewerId!: string;
}
