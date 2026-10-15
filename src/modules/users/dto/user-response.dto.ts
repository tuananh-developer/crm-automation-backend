import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole, UserStatus } from '../enums/user.enum.js';

export class UserResponseDto {
  @ApiProperty({ description: 'ID định danh của người dùng' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Họ tên người dùng' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ description: 'Email người dùng' })
  @IsString()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: UserRole, description: 'Vai trò người dùng' })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, description: 'Trạng thái người dùng' })
  status!: UserStatus;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'Lần cuối đăng nhập',
  })
  lastLoginAt!: Date | null;

  @ApiProperty({ description: 'Thời gian tạo' })
  createdAt!: Date;

  @ApiProperty({ description: 'Thời gian cập nhật' })
  updatedAt!: Date;
}
