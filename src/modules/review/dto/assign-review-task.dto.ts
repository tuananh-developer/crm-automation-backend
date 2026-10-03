import { IsUUID } from 'class-validator';

export class AssignReviewTaskDto {
  @IsUUID()
  reviewerId!: string;
}
