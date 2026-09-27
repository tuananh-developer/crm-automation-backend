import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './entities/lead.entity.js';
import { LeadSource } from './entities/lead-source.entity.js';
import { Interaction } from './entities/interaction.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadSource, Interaction])],
  exports: [TypeOrmModule],
})
export class LeadsModule {}
