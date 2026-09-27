import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowRun } from './entities/workflow-run.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowRun])],
  exports: [TypeOrmModule],
})
export class WorkflowModule {}
