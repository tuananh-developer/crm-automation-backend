import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

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
