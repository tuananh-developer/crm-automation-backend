import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadResponseDto } from './lead-response.dto.js';
import type { CustomerMatchSource } from '../leads.service.js';

export class ConvertedCustomerResponseDto {
  @ApiProperty({ description: 'ID khách hàng' })
  id!: string;

  @ApiProperty({ description: 'Họ tên' })
  name!: string;

  @ApiProperty({ description: 'Email' })
  email!: string;

  @ApiPropertyOptional({ description: 'Số điện thoại' })
  phone!: string | null;

  @ApiPropertyOptional({ description: 'Tên doanh nghiệp' })
  companyName!: string | null;

  @ApiPropertyOptional({ description: 'Website' })
  companyWebsite!: string | null;

  @ApiPropertyOptional({ description: 'Chức danh' })
  jobTitle!: string | null;

  @ApiPropertyOptional({ description: 'Quy mô doanh nghiệp' })
  companySize!: number | null;

  @ApiPropertyOptional({ description: 'Ngành nghề' })
  industry!: string | null;

  @ApiPropertyOptional({ description: 'Trạng thái' })
  status!: string | null;

  @ApiProperty({ description: 'Người tạo' })
  createdBy!: string;

  @ApiPropertyOptional({ description: 'Người cập nhật gần nhất' })
  updatedBy!: string | null;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  notes!: string | null;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;
}

export class ConvertLeadResponseDto {
  @ApiProperty({
    type: () => LeadResponseDto,
    description: 'Thông tin lead sau convert',
  })
  lead!: LeadResponseDto;

  @ApiProperty({
    type: () => ConvertedCustomerResponseDto,
    description: 'Thông tin khách hàng',
  })
  customer!: ConvertedCustomerResponseDto;

  @ApiProperty({
    description: 'Khách hàng có phải mới được tạo hay không',
    example: true,
  })
  customerCreated!: boolean;

  @ApiPropertyOptional({
    description: 'Nguồn khớp trùng khách hàng (EMAIL hoặc PHONE)',
    example: 'EMAIL',
  })
  matchedBy!: CustomerMatchSource | null;

  @ApiProperty({
    description: 'Thông báo kết quả',
    example: 'Lead converted successfully',
  })
  message!: string;
}
