import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class NextBestActionContextQueryDto {
  @ApiProperty({ enum: ['Lead', 'Customer'] })
  @IsIn(['Lead', 'Customer'])
  entityType!: 'Lead' | 'Customer';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId?: string;
}


export class ClaimNextBestActionContextDto extends NextBestActionContextQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;
}
