import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QualificationStatus } from '../enums/lead-intelligence.enum.js';
import { LeadStatus } from '../../leads/enums/lead.enum.js';

export class QualificationResponseDto {
  @ApiProperty({ description: 'ID định danh của bản ghi phân loại' })
  id!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;

  @ApiPropertyOptional({ description: 'ID workflow run tương ứng' })
  workflowRunId!: string | null;

  @ApiProperty({
    enum: QualificationStatus,
    description: 'Trạng thái phân loại của lead',
    example: QualificationStatus.QUALIFIED,
  })
  status!: QualificationStatus;

  @ApiPropertyOptional({
    description: 'Ý định mua hàng hoặc mức độ quan tâm của lead',
  })
  intent!: string | null;

  @ApiPropertyOptional({
    description: 'Độ tin cậy của mô hình AI (0.0 đến 1.0)',
    example: 0.85,
  })
  confidence!: number | null;

  @ApiPropertyOptional({
    description: 'Lý do hoặc giải thích cho kết quả phân loại',
  })
  reason!: string | null;

  @ApiPropertyOptional({
    description: 'Giải thích chi tiết (reasoning) từ mô hình AI',
  })
  reasoning!: string | null;

  @ApiProperty({
    description: 'Yêu cầu đánh giá thủ công của con người (Human Review)',
    example: false,
  })
  reviewRequired!: boolean;

  @ApiPropertyOptional({
    description: 'Nhà cung cấp mô hình AI (OpenAI, Anthropic...)',
  })
  modelProvider!: string | null;

  @ApiPropertyOptional({ description: 'Tên mô hình AI' })
  modelName!: string | null;

  @ApiPropertyOptional({ description: 'Phiên bản mô hình AI' })
  modelVersion!: string | null;

  @ApiPropertyOptional({
    description: 'Snapshot dữ liệu đầu vào tại thời điểm phân loại',
  })
  inputSnapshot!: Record<string, any> | null;

  @ApiPropertyOptional({
    description: 'Snapshot dữ liệu đầu ra từ AI',
  })
  outputSnapshot!: Record<string, any> | null;

  @ApiProperty({ description: 'Thời điểm tạo bản ghi' })
  createdAt!: Date;
}

export class TriggerQualificationResponseDto {
  @ApiProperty({
    description: 'Thông báo kết quả trigger',
    example: 'Lead qualification workflow triggered successfully',
  })
  message!: string;

  @ApiProperty({ description: 'ID định danh của workflow run' })
  workflowRunId!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;
}

export class QualificationCallbackResponseDto {
  @ApiProperty({
    type: QualificationResponseDto,
    description: 'Chi tiết bản ghi phân loại',
  })
  qualification!: QualificationResponseDto;

  @ApiProperty({
    enum: LeadStatus,
    description: 'Trạng thái mới của Lead sau khi cập nhật',
  })
  leadStatus!: LeadStatus;

  @ApiProperty({
    description: 'Cờ báo hiệu có cần duyệt thủ công hay không',
    example: false,
  })
  reviewRequired!: boolean;

  @ApiPropertyOptional({
    description: 'ID của ReviewTask nếu cần duyệt thủ công',
  })
  reviewTaskId?: string | null;
}
