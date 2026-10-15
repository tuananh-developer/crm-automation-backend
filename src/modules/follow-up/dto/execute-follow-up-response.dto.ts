import { ApiProperty } from '@nestjs/swagger';
import { ExecutionStatus } from '../enums/follow-up.enum.js';
import { FollowUpExecutionResponseDto } from './follow-up-execution-response.dto.js';

export class ExecuteFollowUpResponseDto {
  @ApiProperty({ type: FollowUpExecutionResponseDto })
  execution!: FollowUpExecutionResponseDto;

  @ApiProperty({ enum: ExecutionStatus })
  status!: ExecutionStatus;

  @ApiProperty()
  retryCount!: number;

  @ApiProperty()
  message!: string;
}
