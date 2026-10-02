import { IsOptional, IsUUID } from 'class-validator';

export class TriggerQualificationDto {
  @IsUUID()
  @IsOptional()
  userId?: string;
}
