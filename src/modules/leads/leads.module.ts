import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './entities/lead.entity.js';
import { LeadSource } from './entities/lead-source.entity.js';
import { Interaction } from './entities/interaction.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { CustomersModule } from '../customers/customers.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { LeadsService } from './leads.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadSourcesController } from './lead-sources.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadSource,
      Interaction,
      User,
      Customer,
      AuditLog,
    ]),
    CustomersModule,
    AuditModule,
  ],
  controllers: [LeadsController, LeadSourcesController],
  providers: [LeadsService],
  exports: [LeadsService, TypeOrmModule],
})
export class LeadsModule {}
