import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '../enums/lead.enum.js';
import { LeadSourceResponseDto } from './lead-source-response.dto.js';

export class LeadOwnerResponseDto {
  @ApiProperty({ description: 'ID người phụ trách' })
  id!: string;

  @ApiProperty({ description: 'Họ tên người phụ trách' })
  name!: string;

  @ApiProperty({ description: 'Email người phụ trách' })
  email!: string;
}

export class LeadResponseDto {
  @ApiProperty({ description: 'ID định danh của lead' })
  id!: string;

  @ApiProperty({ description: 'Tên' })
  firstName!: string;

  @ApiPropertyOptional({ description: 'Họ' })
  lastName!: string | null;

  @ApiProperty({ description: 'Email liên hệ' })
  email!: string;

  @ApiPropertyOptional({ description: 'Số điện thoại' })
  phone!: string | null;

  @ApiPropertyOptional({ description: 'Tên công ty' })
  companyName!: string | null;

  @ApiPropertyOptional({ description: 'Website công ty' })
  companyWebsite!: string | null;

  @ApiPropertyOptional({ description: 'Chức danh' })
  jobTitle!: string | null;

  @ApiPropertyOptional({ description: 'Quy mô công ty' })
  companySize!: number | null;

  @ApiPropertyOptional({ description: 'Ngành nghề' })
  industry!: string | null;

  @ApiProperty({ enum: LeadStatus, description: 'Trạng thái xử lý của Lead' })
  status!: LeadStatus;

  @ApiProperty({ description: 'ID nguồn lead' })
  sourceId!: string;

  @ApiPropertyOptional({
    type: () => LeadSourceResponseDto,
    description: 'Thông tin chi tiết nguồn',
  })
  source?: LeadSourceResponseDto | null;

  @ApiPropertyOptional({ description: 'ID người sở hữu/phụ trách' })
  ownerId!: string | null;

  @ApiPropertyOptional({
    type: () => LeadOwnerResponseDto,
    description: 'Thông tin người phụ trách',
  })
  owner?: LeadOwnerResponseDto | null;

  @ApiPropertyOptional({ description: 'ID khách hàng đã convert' })
  convertedCustomerId!: string | null;

  @ApiPropertyOptional({ description: 'ID người thực hiện convert' })
  convertedBy!: string | null;

  @ApiPropertyOptional({ description: 'Thời điểm convert' })
  convertedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Ghi chú bổ sung' })
  notes!: string | null;

  @ApiProperty({ description: 'Thời gian khởi tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;
}
