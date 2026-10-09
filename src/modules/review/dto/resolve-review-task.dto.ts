import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReviewDecision } from '../enums/review.enum.js';

export class ResolveReviewTaskDto {
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @IsOptional()
  @IsString()
  reviewComment?: string;
}
