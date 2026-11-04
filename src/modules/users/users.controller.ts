import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from './enums/user.enum.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { CreateUserDto, UpdateUserDto } from './dto/index.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get('assignees')
  findAssignees() {
    return this.usersService.findAssignees();
  }

  @Get(':userId')
  @Roles(UserRole.ADMIN)
  findOne(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.usersService.findOne(userId);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':userId')
  @Roles(UserRole.ADMIN)
  update(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(userId, dto, actor);
  }

  @Post(':userId/disable')
  @Roles(UserRole.ADMIN)
  disable(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.disable(userId, actor);
  }
}
