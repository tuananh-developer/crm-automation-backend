import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEnrollmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
