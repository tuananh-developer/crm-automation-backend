import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Segment, CustomerSegment])],
  exports: [TypeOrmModule],
})
export class CustomersModule {}
