import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './entities/lead.entity.js';
import { LeadSource } from './entities/lead-source.entity.js';
import { Interaction } from './entities/interaction.entity.js';
import { User } from '../users/entities/user.entity.js';
import { LeadsService } from './leads.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadSourcesController } from './lead-sources.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadSource, Interaction, User])],
  controllers: [LeadsController, LeadSourcesController],
  providers: [LeadsService],
  exports: [LeadsService, TypeOrmModule],
})
export class LeadsModule {}
