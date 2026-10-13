import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../users/enums/user.enum.js';

export class UserProfileDto {
  @ApiProperty({ example: '8583ea23-1d57-4ba3-bbf9-0b04c8f553f1' })
  id!: string;

  @ApiProperty({ example: 'Admin User' })
  name!: string;

  @ApiProperty({ example: 'admin@crm.local' })
  email!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.ADMIN })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status!: UserStatus;

  @ApiProperty({ example: '2026-10-13T08:00:00.000Z', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ example: '2026-10-10T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-13T08:00:00.000Z' })
  updatedAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Bearer Access Token',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'Bearer',
    description: 'Loại token',
  })
  tokenType!: string;

  @ApiProperty({
    example: 86400,
    description: 'Thời gian hiệu lực tính bằng giây',
  })
  expiresIn!: number;

  @ApiProperty({
    type: () => UserProfileDto,
    description: 'Thông tin tài khoản (đã loại bỏ password hash)',
  })
  user!: UserProfileDto;
}
