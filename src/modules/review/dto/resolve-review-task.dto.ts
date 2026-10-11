import { IsEnum, IsString, ValidateIf } from 'class-validator';
import { ReviewDecision } from '../enums/review.enum.js';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveReviewTaskDto {
  @ApiProperty({
    description: 'Review decision',
    example: 'APPROVE',
    enum: ReviewDecision,
  })
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @ApiProperty({
    description: 'Review comment (required when decision is MODIFY)',
    example: 'Please update pricing details',
    maxLength: 1000,
  })
  @IsString()
  @ValidateIf((o: ResolveReviewTaskDto) => o.decision === ReviewDecision.MODIFY)
  reviewComment!: string;
}
