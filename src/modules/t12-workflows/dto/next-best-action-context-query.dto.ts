import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
}


export class ClaimNextBestActionContextDto extends NextBestActionContextQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  n8nExecutionId!: string;
}
