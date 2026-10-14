import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LeadSourceResponseDto {
  @ApiProperty({
    description: 'ID định danh nguồn lead',
    example: 'd3b07384-d113-4f9e-b9bb-236b3b5e40e2',
  })
  id!: string;

  @ApiProperty({
    description: 'Tên nguồn lead',
    example: 'Website Contact Form',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Mô tả chi tiết',
    example: 'Organic website inbound submissions',
  })
  description!: string | null;

  @ApiProperty({ description: 'Trạng thái hoạt động', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật gần nhất' })
  updatedAt!: Date;
}
