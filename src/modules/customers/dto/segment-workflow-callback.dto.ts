import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SegmentStatisticsDto {
  @ApiProperty({ description: 'Total customers evaluated' })
  @IsNumber()
  total!: number;

  @ApiProperty({ description: 'Customers processed' })
  @IsNumber()
  processed!: number;

  @ApiProperty({ description: 'Customers matched' })
  @IsNumber()
  matched!: number;

  @ApiProperty({ description: 'Customers unmatched' })
  @IsNumber()
  unmatched!: number;

  @ApiProperty({ description: 'Match rate percentage' })
  @IsString()
  matchRate!: string;
}

export class AiInsightDto {
  @ApiProperty({ description: 'Insight text' })
  @IsString()
  insight!: string;

  @ApiProperty({ description: 'Evidence reference' })
  @IsString()
  evidence!: string;

  @ApiProperty({ description: 'Confidence score' })
  @IsNumber()
  confidence!: number;
}

export class SegmentWorkflowCallbackDto {
  @ApiPropertyOptional({
    description: 'UUID of the WorkflowRun (auto-created if not provided)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  workflowRunId?: string;

  @ApiProperty({ description: 'Segment ID', format: 'uuid' })
  @IsUUID()
  segmentId!: string;

  @ApiProperty({ description: 'Segment name' })
  @IsString()
  segmentName!: string;

  @ApiProperty({
    description: 'Overall status',
    enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
    default: 'SUCCESS',
  })
  @IsIn(['SUCCESS', 'FAILED', 'PARTIAL'])
  status!: 'SUCCESS' | 'FAILED' | 'PARTIAL';

  @ApiProperty({
    description: 'Evaluation statistics',
    type: SegmentStatisticsDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => SegmentStatisticsDto)
  statistics!: SegmentStatisticsDto;

  @ApiProperty({ description: 'Validated AI insights', type: [AiInsightDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiInsightDto)
  aiInsights!: AiInsightDto[];

  @ApiProperty({ description: 'Number of rejected insights' })
  @IsNumber()
  rejectedInsights!: number;

  @ApiProperty({ description: 'Whether anomaly was detected' })
  @IsOptional()
  anomalyDetected?: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}
