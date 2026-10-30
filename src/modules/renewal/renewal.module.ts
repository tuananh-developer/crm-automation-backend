import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from './entities/contract.entity.js';
import { RenewalDraft } from './entities/renewal-draft.entity.js';
import { RenewalService } from './renewal.service.js';
import { RenewalController } from './renewal.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, RenewalDraft])],
  controllers: [RenewalController],
  providers: [RenewalService],
  exports: [RenewalService],
})
export class RenewalModule {}
