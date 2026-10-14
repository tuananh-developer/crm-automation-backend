import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký tài khoản người dùng mới',
    description:
      'Tạo tài khoản mới với mật khẩu được hash bằng bcrypt (10 rounds) và trả về JWT Bearer token.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đăng ký tài khoản thành công',
    type: AuthResponseDto,
  })
  @ApiConflictResponse({
    description: 'Email đã tồn tại trong hệ thống',
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập vào hệ thống',
    description:
      'Xác thực email và mật khẩu bằng thuật toán an toàn constant-time, cấp JWT Bearer token và cập nhật thời gian đăng nhập gần nhất.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đăng nhập thành công',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({
    description:
      'Email hoặc mật khẩu không chính xác, hoặc tài khoản đã bị khóa',
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lấy thông tin tài khoản đang đăng nhập',
    description:
      'Trích xuất danh tính người dùng hiện tại từ JWT Bearer token trong Authorization header.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin profile thành công',
    type: UserProfileDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Token không hợp lệ, đã hết hạn hoặc không có quyền truy cập',
  })
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
