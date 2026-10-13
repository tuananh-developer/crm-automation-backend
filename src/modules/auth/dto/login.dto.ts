import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@crm.local',
    description: 'Địa chỉ email đã đăng ký',
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(320, { message: 'Email must not exceed 320 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  email!: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Mật khẩu tài khoản',
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}
