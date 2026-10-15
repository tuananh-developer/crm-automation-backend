import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination-meta.dto.js';

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'Danh sách dữ liệu' })
  data!: T[];

  @ApiProperty({
    type: () => PaginationMetaDto,
    description: 'Thông tin phân trang',
  })
  meta!: PaginationMetaDto;
}
