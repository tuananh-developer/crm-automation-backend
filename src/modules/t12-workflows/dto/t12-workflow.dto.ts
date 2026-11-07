import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class StartNextBestActionDto {
  @ApiProperty({ enum: ['Lead', 'Customer'] })
  @IsIn(['Lead', 'Customer'])
  entityType!: 'Lead' | 'Customer';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;
}

export class NextBestActionItemDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  actionCode!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(100)
  rank!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  explanation!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  evidenceIds!: string[];

  @ApiProperty()
  @IsBoolean()
  requiresApproval!: boolean;
}

export class NextBestActionCallbackDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty({ enum: ['Lead', 'Customer'] })
  @IsIn(['Lead', 'Customer'])
  entityType!: 'Lead' | 'Customer';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ type: [NextBestActionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => NextBestActionItemDto)
  recommendations!: NextBestActionItemDto[];

  @ApiProperty({ default: 'AI_NEXT_BEST_ACTION' })
  @IsIn(['AI_NEXT_BEST_ACTION'])
  source!: 'AI_NEXT_BEST_ACTION';

  @ApiProperty({ default: 'COMPLETED' })
  @IsIn(['COMPLETED'])
  status!: 'COMPLETED';
}

export class NextBestActionReviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ enum: ['Lead', 'Customer'] })
  @IsIn(['Lead', 'Customer'])
  entityType!: 'Lead' | 'Customer';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  recommendationId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class StartSalesMeetingDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attendeeIds!: string[];

  @ApiProperty({ minLength: 20, maxLength: 150000 })
  @IsString()
  @MinLength(20)
  @MaxLength(150000)
  transcript!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  meetingPurpose?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ default: 'MEETING_TRANSCRIPT' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string;
}

export class SaveConversationTranscriptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  meetingId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  sourceType!: string;

  @ApiProperty({ minLength: 20, maxLength: 120000 })
  @IsString()
  @MinLength(20)
  @MaxLength(120000)
  transcript!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  redactionMode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;
}

export class SaveMeetingSummaryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  transcriptId!: string;

  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  summary!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(100)
  decisions!: Array<Record<string, unknown>>;

  @ApiProperty({ type: [Object] })
  @IsArray()
  @ArrayMaxSize(100)
  risks!: Array<Record<string, unknown>>;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class MeetingActionItemDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  ownerAttendeeId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidence?: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiProperty({ default: true })
  @IsBoolean()
  requiresConfirmation!: boolean;
}

export class SaveMeetingActionItemsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty({ type: [MeetingActionItemDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MeetingActionItemDto)
  actionItems!: MeetingActionItemDto[];

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class NotifyMeetingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  meetingId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  summaryId!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  attendeeIds!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class RequestedQuoteItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  catalogItemId!: string;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;
}

export class StartQuoteDraftDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ type: [RequestedQuoteItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RequestedQuoteItemDto)
  requestedItems!: RequestedQuoteItemDto[];

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  requirements?: string;

  @ApiProperty({ example: 'VND' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;
}

export class QuoteLineItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  catalogItemId!: string;

  @ApiProperty({ minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;
}

export class QuotePricePreviewDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string | null;

  @ApiProperty({ type: [QuoteLineItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemInputDto)
  items!: QuoteLineItemInputDto[];

  @ApiProperty({ example: 'VND' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class CreateQuoteInternalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string | null;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  executiveSummary?: string;

  @ApiPropertyOptional({ maxLength: 15000 })
  @IsOptional()
  @IsString()
  @MaxLength(15000)
  body?: string;

  @ApiProperty({ type: [QuoteLineItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemInputDto)
  items!: QuoteLineItemInputDto[];

  @ApiProperty({ example: 'VND' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;
}

export class SubmitQuoteApprovalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(180)
  idempotencyKey!: string;
}

export class DecideQuoteApprovalDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class CreateCatalogItemDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiProperty({ example: 'VND' })
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency!: string;

  @ApiProperty({ minimum: 0, maximum: 100, default: 0 })
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent!: number;
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ConfirmMeetingActionItemDto {
  @ApiProperty({ enum: ['CONFIRM', 'REJECT'] })
  @IsIn(['CONFIRM', 'REJECT'])
  decision!: 'CONFIRM' | 'REJECT';

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}


export class ClaimQuoteEntityContextDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workflowRunId!: string;

  @ApiProperty({ minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'n8nExecutionId must not be blank' })
  n8nExecutionId!: string;
}
