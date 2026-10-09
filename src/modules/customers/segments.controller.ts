import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SegmentsService } from './segments.service.js';
import {
  CreateSegmentDto,
  EvaluateSegmentBulkDto,
  EvaluateSegmentDto,
  QuerySegmentDto,
  UpdateSegmentDto,
} from './dto/index.js';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  create(@Body() dto: CreateSegmentDto) {
    return this.segmentsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QuerySegmentDto) {
    return this.segmentsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSegmentDto,
  ) {
    return this.segmentsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.segmentsService.remove(id);
  }

  @Get(':id/customers')
  getCustomers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QuerySegmentDto,
  ) {
    return this.segmentsService.getCustomers(id, query);
  }

  @Post(':id/evaluate')
  evaluateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateSegmentDto,
  ) {
    return this.segmentsService.evaluateCustomer(id, dto);
  }

  @Post(':id/evaluate-all')
  evaluateAll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateSegmentBulkDto,
  ) {
    return this.segmentsService.evaluateAll(id, dto);
  }
}
