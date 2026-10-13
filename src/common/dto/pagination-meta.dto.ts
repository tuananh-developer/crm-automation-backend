import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Số lượng bản ghi mỗi trang', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Tổng số bản ghi', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Tổng số trang', example: 5 })
  totalPages!: number;

  @ApiPropertyOptional({
    description: 'Có trang tiếp theo không',
    example: true,
  })
  hasNextPage?: boolean;

  @ApiPropertyOptional({
    description: 'Có trang trước đó không',
    example: false,
  })
  hasPreviousPage?: boolean;
}
