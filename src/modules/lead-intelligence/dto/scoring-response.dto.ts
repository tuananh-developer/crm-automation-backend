import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreLabel } from '../enums/lead-intelligence.enum.js';
import { QualificationResponseDto } from './qualification-response.dto.js';
import { EnrichmentResponseDto } from './enrichment-response.dto.js';

export class ScoringResponseDto {
  @ApiProperty({ description: 'ID định danh của điểm số' })
  id!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;

  @ApiPropertyOptional({ description: 'ID workflow run tương ứng' })
  workflowRunId!: string | null;

  @ApiProperty({
    description: 'Điểm số đánh giá lead (0 đến 100)',
    example: 85,
  })
  score!: number;

  @ApiProperty({
    enum: ScoreLabel,
    description: 'Phân loại mức độ tiềm năng (HOT, WARM, COLD)',
    example: ScoreLabel.HOT,
  })
  label!: ScoreLabel;

  @ApiPropertyOptional({
    description: 'Lý do chấm điểm và nhận định tổng quan',
  })
  reason!: string | null;

  @ApiPropertyOptional({
    description: 'Chi tiết phân bổ điểm số (Breakdown các tiêu chí)',
    example: {
      decisionMakerBonus: 20,
      companySizeBonus: 15,
      websiteBonus: 10,
      engagementBonus: 20,
    },
  })
  breakdown!: Record<string, any> | null;

  @ApiPropertyOptional({
    description: 'Các đặc trưng (features) được sử dụng để tính điểm',
  })
  scoringFeatures!: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Nhà cung cấp mô hình chấm điểm' })
  modelProvider!: string | null;

  @ApiPropertyOptional({ description: 'Tên mô hình chấm điểm' })
  modelName!: string | null;

  @ApiPropertyOptional({ description: 'Phiên bản mô hình chấm điểm' })
  modelVersion!: string | null;

  @ApiPropertyOptional({
    description: 'Snapshot dữ liệu đầu vào khi chấm điểm',
  })
  inputSnapshot!: Record<string, any> | null;

  @ApiPropertyOptional({
    description: 'Snapshot dữ liệu đầu ra từ mô hình chấm điểm',
  })
  outputSnapshot!: Record<string, any> | null;

  @ApiProperty({ description: 'Thời điểm tạo bản ghi điểm số' })
  createdAt!: Date;
}

export class TriggerScoringResponseDto {
  @ApiProperty({
    description: 'Thông báo kết quả trigger chấm điểm',
    example: 'Lead scoring workflow triggered successfully',
  })
  message!: string;

  @ApiProperty({ description: 'ID định danh của workflow run' })
  workflowRunId!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;
}

export class ScoringCallbackResponseDto {
  @ApiPropertyOptional({
    type: ScoringResponseDto,
    description: 'Bản ghi điểm số mới được lưu (nếu thành công)',
  })
  score!: ScoringResponseDto | null;

  @ApiProperty({
    description: 'Cờ xác nhận trạng thái WorkflowRun đã được cập nhật',
    example: true,
  })
  workflowRunUpdated!: boolean;
}

export class ScoringContextResponseDto {
  @ApiProperty({ description: 'Thông tin hồ sơ Lead' })
  lead!: Record<string, any>;

  @ApiPropertyOptional({
    type: QualificationResponseDto,
    description: 'Kết quả phân loại AI mới nhất (nếu có)',
  })
  qualification!: QualificationResponseDto | null;

  @ApiPropertyOptional({
    type: EnrichmentResponseDto,
    description: 'Dữ liệu làm giàu mới nhất (nếu có)',
  })
  enrichment!: EnrichmentResponseDto | null;

  @ApiProperty({
    description: 'Danh sách các tương tác gần đây của lead',
    isArray: true,
  })
  interactions!: Record<string, any>[];

  @ApiProperty({
    description: 'Tổng hợp các thuộc tính features phục vụ mô hình scoring',
  })
  scoringFeatures!: Record<string, any>;
}
