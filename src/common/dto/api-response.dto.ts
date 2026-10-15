import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StandardApiResponseDto<T> {
  @ApiProperty({ description: 'Mã HTTP status code', example: 200 })
  statusCode!: number;

  @ApiProperty({ description: 'Trạng thái thành công', example: true })
  success!: boolean;

  @ApiProperty({ description: 'Dữ liệu phản hồi' })
  data!: T;

  @ApiPropertyOptional({
    description: 'Thông báo đi kèm',
    example: 'Thành công',
  })
  message?: string;
}
