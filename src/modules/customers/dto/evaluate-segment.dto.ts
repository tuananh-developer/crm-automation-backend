import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class EvaluateSegmentDto {
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @IsUUID()
  @IsNotEmpty()
  segmentId!: string;

  @IsString()
  @IsOptional()
  userId?: string;
}
