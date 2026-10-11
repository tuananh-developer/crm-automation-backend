import { IsOptional, IsString } from 'class-validator';

export class CancelEnrollmentDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}
