import { IsOptional, IsUUID } from 'class-validator';

export class TriggerScoringDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
