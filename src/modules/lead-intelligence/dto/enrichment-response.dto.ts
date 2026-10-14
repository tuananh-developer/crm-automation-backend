import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnrichmentStatus } from '../enums/lead-intelligence.enum.js';

export class EnrichmentResponseDto {
  @ApiProperty({ description: 'ID định danh của bản ghi làm giàu dữ liệu' })
  id!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;

  @ApiPropertyOptional({ description: 'ID workflow run tương ứng' })
  workflowRunId!: string | null;

  @ApiProperty({
    description:
      'Nhà cung cấp dữ liệu làm giàu (Clearbit, Apollo, Hunter, Mock...)',
    example: 'mock',
  })
  provider!: string;

  @ApiPropertyOptional({
    description: 'ID request từ phía nhà cung cấp bên ngoài',
  })
  externalRequestId!: string | null;

  @ApiProperty({
    enum: EnrichmentStatus,
    description: 'Trạng thái thực hiện làm giàu dữ liệu',
    example: EnrichmentStatus.SUCCESS,
  })
  status!: EnrichmentStatus;

  @ApiPropertyOptional({ description: 'Tên công ty làm giàu được' })
  companyName!: string | null;

  @ApiPropertyOptional({ description: 'Website công ty làm giàu được' })
  companyWebsite!: string | null;

  @ApiPropertyOptional({ description: 'Ngành nghề kinh doanh công ty' })
  companyIndustry!: string | null;

  @ApiPropertyOptional({
    description: 'Ngành nghề (alias industry)',
    example: 'Software & Technology',
  })
  industry!: string | null;

  @ApiPropertyOptional({
    description: 'Quy mô số lượng nhân sự công ty',
    example: 120,
  })
  companySize!: number | null;

  @ApiPropertyOptional({
    description: 'Ước tính khoảng doanh thu công ty (Revenue Range)',
    example: '$10M - $50M',
  })
  revenueRange!: string | null;

  @ApiPropertyOptional({ description: 'Chức danh của liên hệ' })
  contactJobTitle!: string | null;

  @ApiPropertyOptional({ description: 'Đường dẫn LinkedIn của liên hệ' })
  contactLinkedinUrl!: string | null;

  @ApiPropertyOptional({
    description: 'Đường dẫn LinkedIn (alias linkedinUrl)',
    example: 'https://linkedin.com/in/example',
  })
  linkedinUrl!: string | null;

  @ApiPropertyOptional({
    description: 'Dữ liệu thô JSON trả về từ nhà cung cấp',
  })
  rawResponse!: Record<string, any> | null;

  @ApiPropertyOptional({ description: 'Thông báo lỗi nếu quá trình thất bại' })
  errorMessage!: string | null;

  @ApiProperty({ description: 'Thời điểm hoàn tất làm giàu dữ liệu' })
  enrichedAt!: Date;

  @ApiProperty({ description: 'Thời điểm tạo bản ghi' })
  createdAt!: Date;
}

export class TriggerEnrichmentResponseDto {
  @ApiProperty({
    description: 'Thông báo kết quả trigger làm giàu',
    example: 'Lead enrichment workflow triggered successfully',
  })
  message!: string;

  @ApiProperty({ description: 'ID định danh của workflow run' })
  workflowRunId!: string;

  @ApiProperty({ description: 'ID định danh của bản ghi enrichment vừa tạo' })
  enrichmentId!: string;

  @ApiProperty({ description: 'ID định danh của lead' })
  leadId!: string;
}

export class EnrichmentCallbackResponseDto {
  @ApiProperty({
    type: EnrichmentResponseDto,
    description: 'Chi tiết bản ghi làm giàu dữ liệu sau khi cập nhật',
  })
  enrichment!: EnrichmentResponseDto;

  @ApiProperty({
    description: 'Cờ xác nhận WorkflowRun đã được cập nhật thành công',
    example: true,
  })
  workflowRunUpdated!: boolean;
}

export class MockEnrichmentResponseDto {
  @ApiPropertyOptional({ description: 'Domain công ty' })
  domain?: string;

  @ApiPropertyOptional({ description: 'Email liên hệ' })
  email?: string;

  @ApiProperty({ description: 'Tên nhà cung cấp' })
  provider!: string;

  @ApiPropertyOptional({ description: 'Tên công ty' })
  companyName?: string;

  @ApiPropertyOptional({ description: 'Ngành nghề công ty' })
  industry?: string;

  @ApiPropertyOptional({ description: 'Quy mô công ty' })
  companySize?: number;

  @ApiPropertyOptional({ description: 'Doanh thu ước tính' })
  revenueRange?: string;

  @ApiPropertyOptional({ description: 'Chức vụ' })
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'LinkedIn' })
  linkedinUrl?: string;

  [key: string]: any;
}
