import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewTask } from './entities/review-task.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewTask])],
  exports: [TypeOrmModule],
})
export class ReviewModule {}
