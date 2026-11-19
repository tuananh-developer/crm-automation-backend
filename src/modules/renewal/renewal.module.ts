import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { CustomerTask } from '../customers/entities/customer-task.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { RenewalService } from './renewal.service.js';
import { RenewalController } from './renewal.controller.js';
import { CustomerContractsController } from './customer-contracts.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RenewalAuthGuard } from './guards/renewal-auth.guard.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CommunicationModule } from '../communication/communication.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contract,
      RenewalDraft,
      Customer,
      CustomerTask,
      AuditLog,
    ]),
    NotificationsModule,
    CommunicationModule,
  ],
  controllers: [RenewalController, CustomerContractsController],
  providers: [RenewalService, N8nAuthGuard, JwtAuthGuard, RenewalAuthGuard],
  exports: [RenewalService],
})
export class RenewalModule {}
