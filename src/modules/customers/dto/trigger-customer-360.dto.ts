import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class TriggerCustomer360Dto {
  @ApiPropertyOptional({
    description: 'Optional user ID who initiated the 360 analysis',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class TriggerCustomer360ResponseDto {
  @ApiProperty({
    example: 'Customer 360 analysis workflow triggered successfully',
  })
  message!: string;

  @ApiProperty({ example: '5dbc025e-1185-4977-8db5-046924340739' })
  customerId!: string;

  @ApiProperty({ example: '9a8b7c6d-5e4f-3a2b-1c0d-e9f8a7b6c5d4' })
  workflowRunId!: string;
}
