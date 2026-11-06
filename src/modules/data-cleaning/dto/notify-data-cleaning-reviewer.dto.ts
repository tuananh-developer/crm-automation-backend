import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class NotifyDataCleaningReviewerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  eventId!: string;

  @ApiProperty({ minimum: 0, maximum: 100000 })
  @IsInt()
  @Min(0)
  @Max(100000)
  findingCount!: number;

  @ApiProperty({ minLength: 8, maxLength: 180 })
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}
