import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity.js';
import { Segment } from './entities/segment.entity.js';
import { CustomerSegment } from './entities/customer-segment.entity.js';
import { SegmentationService } from './segmentation.service.js';
import { SegmentationController } from './segmentation.controller.js';
import { CustomersController } from './customers.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Segment, CustomerSegment])],
  controllers: [SegmentationController, CustomersController],
  providers: [SegmentationService],
  exports: [TypeOrmModule, SegmentationService],
})
export class CustomersModule {}
