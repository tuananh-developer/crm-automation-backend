import { IsEnum, IsString, ValidateIf } from 'class-validator';
import { ReviewDecision } from '../enums/review.enum.js';

export class ResolveReviewTaskDto {
  @IsEnum(ReviewDecision)
  decision!: ReviewDecision;

  @IsString()
  @ValidateIf((o: ResolveReviewTaskDto) => o.decision === ReviewDecision.MODIFY)
  reviewComment!: string;
}
