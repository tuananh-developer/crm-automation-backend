import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { Customer } from '../customers/entities/customer.entity.js';
import { RenewalService } from './renewal.service.js';
import { RenewalController } from './renewal.controller.js';
import { CustomerContractsController } from './customer-contracts.controller.js';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RenewalAuthGuard } from './guards/renewal-auth.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, RenewalDraft, Customer])],
  controllers: [RenewalController, CustomerContractsController],
  providers: [RenewalService, N8nAuthGuard, JwtAuthGuard, RenewalAuthGuard],
  exports: [RenewalService],
})
export class RenewalModule {}
