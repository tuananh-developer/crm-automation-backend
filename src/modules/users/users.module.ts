import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuditLog]), AuthModule],
  controllers: [UsersController],
  providers: [UsersService, RolesGuard],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
